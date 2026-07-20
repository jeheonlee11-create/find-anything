/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx),
      jobId = response.headers.get("x-find-anything-job-id"),
      jobToken = response.headers.get("x-find-anything-job-token");
    if (jobId && jobToken) {
      ctx.waitUntil(dispatchInternalContinuation(request.url, jobId, jobToken));
      const headers = new Headers(response.headers);
      headers.delete("x-find-anything-job-id");
      headers.delete("x-find-anything-job-token");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

async function dispatchInternalContinuation(
  requestUrl: string,
  jobId: string,
  jobToken: string,
) {
  const continuationUrl = new URL("/api/internal/indexing/continue", requestUrl);
  // Give each bounded batch its own Worker request lifetime. The continuation
  // response is intercepted by the Worker and dispatches the following batch.
  const response = await fetch(
    new Request(continuationUrl, {
      method: "POST",
      headers: {
        "x-find-anything-job-id": jobId,
        "x-find-anything-job-token": jobToken,
      },
    }),
  );
  await response.arrayBuffer();
}

export default worker;
