import {
  isIndexingQueueMessage,
  verifyServiceRequest,
  type IndexingContinuationResult,
  type IndexingQueueMessage,
} from "../../lib/indexing/queue-protocol.ts";
import { IndexingQueueCoordinator } from "./coordinator.ts";
import { callSite, markDispatched } from "./site-client.ts";

type QueueBinding = {
  send(
    message: IndexingQueueMessage,
    options?: { delaySeconds?: number },
  ): Promise<void>;
};

type Message<T> = {
  body: T;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

type MessageBatch<T> = {
  queue: string;
  messages: Message<T>[];
};

type Env = {
  INDEXING_QUEUE: QueueBinding;
  INDEXING_QUEUE_ENABLED: string;
  INDEXING_QUEUE_INGRESS_SECRET: string;
  INDEXING_QUEUE_SERVICE_SECRET: string;
  SITE_ORIGIN: string;
  INDEXING_QUEUE_NAME: string;
  INDEXING_DLQ_NAME: string;
};

function queueEnabled(env: Env) {
  return env.INDEXING_QUEUE_ENABLED === "true";
}

function coordinator(env: Env) {
  return new IndexingQueueCoordinator(
    { send: (message) => env.INDEXING_QUEUE.send(message) },
    {
      claimDue: async (leaseOwner) => {
        const result = await callSite<{ messages: IndexingQueueMessage[] }>(
          env,
          "/api/internal/indexing/queue/due",
          { leaseOwner, limit: 25 },
        );
        return result.messages;
      },
      markDispatched: (message, leaseOwner) =>
        markDispatched(env, message, leaseOwner).then(() => undefined),
      releaseDispatch: (message, leaseOwner) =>
        callSite(
          env,
          "/api/internal/indexing/queue/dispatch-failed",
          { message, leaseOwner },
        ).then(() => undefined),
      execute: (message, leaseOwner) =>
        callSite<IndexingContinuationResult>(
          env,
          "/api/internal/indexing/queue/execute",
          { message, leaseOwner },
        ),
      deadLetter: (message) =>
        callSite(env, "/api/internal/indexing/queue/dead-letter", {
          message,
        }).then(() => undefined),
    },
  );
}

const worker = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/enqueue")
      return new Response("Not found.", { status: 404 });
    if (!queueEnabled(env))
      return Response.json(
        { error: { code: "QUEUE_DISPATCH_DISABLED", message: "Unavailable." } },
        { status: 503 },
      );
    const verified = await verifyServiceRequest(
      request,
      env.INDEXING_QUEUE_INGRESS_SECRET,
    );
    if (!verified.ok)
      return new Response("Not found.", { status: 404 });
    const message = JSON.parse(verified.body) as unknown;
    if (!isIndexingQueueMessage(message))
      return Response.json(
        { error: { code: "INVALID_MESSAGE", message: "Invalid message." } },
        { status: 400 },
      );
    await coordinator(env).enqueue(message);
    return Response.json({ accepted: true }, { status: 202 });
  },

  async queue(batch: MessageBatch<unknown>, env: Env) {
    if (!queueEnabled(env)) {
      for (const delivery of batch.messages)
        delivery.retry({ delaySeconds: 900 });
      return;
    }
    const service = coordinator(env);
    for (const delivery of batch.messages) {
      if (!isIndexingQueueMessage(delivery.body)) {
        delivery.ack();
        continue;
      }
      try {
        if (batch.queue === env.INDEXING_DLQ_NAME)
          await service.consumeDeadLetter(delivery.body);
        else await service.consume(delivery.body);
        delivery.ack();
      } catch (error) {
        const status =
          typeof error === "object" &&
          error &&
          "status" in error &&
          typeof error.status === "number"
            ? error.status
            : 0;
        if (status >= 400 && status < 500 && status !== 409) {
          await service.consumeDeadLetter(delivery.body);
          delivery.ack();
        } else
          delivery.retry({
            delaySeconds: Math.min(900, 15 * 2 ** delivery.attempts),
          });
      }
    }
  },

  async scheduled(_controller: unknown, env: Env) {
    if (!queueEnabled(env)) return;
    await coordinator(env).reconcile();
  },
};

export default worker;
