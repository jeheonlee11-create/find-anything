/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { logIndexingEvent } from "../lib/observability/indexing-log";
import { executeIndexingContinuation } from "./indexing-continuation";

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
      jobToken = response.headers.get("x-find-anything-job-token"),
      continuationId = response.headers.get(
        "x-find-anything-continuation-id",
      );
    if (jobId && jobToken && continuationId) {
      logIndexingEvent("continuation_scheduled", {
        jobId,
        stage: "connecting",
      });
      ctx.waitUntil(
        runInternalContinuation(
          request.url,
          jobId,
          jobToken,
          continuationId,
          env,
          ctx,
        ).catch(
          () =>
            markSchedulingFailure(
              request.url,
              jobId,
              jobToken,
              continuationId,
              env,
              ctx,
            ),
        ),
      );
      const headers = new Headers(response.headers);
      headers.delete("x-find-anything-job-id");
      headers.delete("x-find-anything-job-token");
      headers.delete("x-find-anything-continuation-id");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

async function runInternalContinuation(
  requestUrl: string,
  jobId: string,
  jobToken: string,
  continuationId: string,
  env: Env,
  ctx: ExecutionContext,
) {
  const dispatchUrl = new URL("/api/internal/indexing/dispatch", requestUrl),
    continuationUrl = new URL("/api/internal/indexing/continue", requestUrl),
    internalHeaders = {
      "x-find-anything-job-id": jobId,
      "x-find-anything-job-token": jobToken,
      "x-find-anything-continuation-id": continuationId,
    },
    continuationRequest = () =>
      new Request(continuationUrl, {
        method: "POST",
        headers: internalHeaders,
      });
  await executeIndexingContinuation({
    jobId,
    continuationId,
    persistDispatch: () =>
      handler.fetch(
        new Request(dispatchUrl, {
          method: "POST",
          headers: internalHeaders,
        }),
        env,
        ctx,
      ),
    // The outbox row is committed before this immediate self-request. A
    // platform-managed drainer is still required to recover the narrow window
    // where this execution ends after persistence but before the fetch begins.
    startFreshWorker: () => fetch(continuationRequest()),
  });
}

async function markSchedulingFailure(
  requestUrl: string,
  jobId: string,
  jobToken: string,
  continuationId: string,
  env: Env,
  ctx: ExecutionContext,
) {
  const failureUrl = new URL(
      "/api/internal/indexing/scheduling-failure",
      requestUrl,
    ),
    response = await handler.fetch(
      new Request(failureUrl, {
        method: "POST",
        headers: {
          "x-find-anything-job-id": jobId,
          "x-find-anything-job-token": jobToken,
          "x-find-anything-continuation-id": continuationId,
        },
      }),
      env,
      ctx,
    );
  await response.arrayBuffer();
}

export default worker;
