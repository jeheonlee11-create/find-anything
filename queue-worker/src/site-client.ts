import {
  signedServiceHeaders,
  type IndexingQueueMessage,
} from "../../lib/indexing/queue-protocol.ts";

export type QueueWorkerEnvironment = {
  SITE_ORIGIN: string;
  INDEXING_QUEUE_SERVICE_SECRET: string;
};

export async function callSite<T>(
  env: QueueWorkerEnvironment,
  path: string,
  bodyValue: unknown,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(path, env.SITE_ORIGIN).toString(),
    body = JSON.stringify(bodyValue),
    headers = await signedServiceHeaders({
      secret: env.INDEXING_QUEUE_SERVICE_SECRET,
      method: "POST",
      url,
      body,
    }),
    response = await fetcher(url, { method: "POST", headers, body });
  if (!response.ok) {
    const error = new Error(`SITE_INTERNAL_HTTP_${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export async function markDispatched(
  env: QueueWorkerEnvironment,
  message: IndexingQueueMessage,
  leaseOwner?: string,
) {
  return callSite(env, "/api/internal/indexing/queue/dispatched", {
    message,
    leaseOwner,
  });
}
