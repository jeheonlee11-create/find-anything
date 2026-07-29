/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { logIndexingEvent } from "../lib/observability/indexing-log";
import { enqueueWithManagedQueue } from "../lib/indexing/queue-client";
import { continuationMessage } from "../lib/indexing/queue-protocol";
import { markQueueContinuationDispatched } from "../lib/indexing/jobs";
import { executeIndexingContinuation } from "./indexing-continuation";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  INDEXING_QUEUE_DISPATCH_URL?: string;
  INDEXING_QUEUE_INGRESS_SECRET?: string;
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
      ),
      continuationSequence = Number(
        response.headers.get("x-find-anything-continuation-sequence"),
      ),
      attemptEpoch = Number(
        response.headers.get("x-find-anything-attempt-epoch"),
      );
    if (
      jobId &&
      continuationId &&
      Number.isSafeInteger(continuationSequence) &&
      continuationSequence > 0 &&
      Number.isSafeInteger(attemptEpoch) &&
      attemptEpoch > 0
    ) {
      const message = continuationMessage({
        jobId,
        continuationId,
        sequence: continuationSequence,
        attemptEpoch,
      });
      logIndexingEvent("queue_enqueue_requested", {
        jobId,
        continuationId,
        stage: "connecting",
      });
      try {
        await enqueueWithManagedQueue(message, {
          dispatchUrl: env.INDEXING_QUEUE_DISPATCH_URL,
          signingSecret: env.INDEXING_QUEUE_INGRESS_SECRET,
        });
        await markQueueContinuationDispatched({ message });
        logIndexingEvent("queue_enqueue_accepted", {
          jobId,
          continuationId,
          stage: "connecting",
        });
      } catch {
        logIndexingEvent("queue_message_retried", {
          jobId,
          continuationId,
          errorCode: "QUEUE_ENQUEUE_DEFERRED_TO_RECONCILER",
          stage: "connecting",
        });
        if (jobToken) {
          const continuationHeaders = {
            "x-find-anything-job-id": jobId,
            "x-find-anything-job-token": jobToken,
            "x-find-anything-continuation-id": continuationId,
          };
          ctx.waitUntil(
            executeIndexingContinuation({
              jobId,
              continuationId,
              persistDispatch: () =>
                handler.fetch(
                  new Request(
                    new URL("/api/internal/indexing/dispatch", request.url),
                    { method: "POST", headers: continuationHeaders },
                  ),
                  env,
                  ctx,
                ),
              startFreshWorker: () =>
                handler.fetch(
                  new Request(
                    new URL("/api/internal/indexing/continue", request.url),
                    { method: "POST", headers: continuationHeaders },
                  ),
                  env,
                  ctx,
                ),
            }).catch(() => undefined),
          );
        }
      }
      const headers = new Headers(response.headers);
      headers.delete("x-find-anything-job-id");
      headers.delete("x-find-anything-job-token");
      headers.delete("x-find-anything-continuation-id");
      headers.delete("x-find-anything-continuation-sequence");
      headers.delete("x-find-anything-attempt-epoch");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  },
};

export default worker;
