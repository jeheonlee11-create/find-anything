import {
  type IndexingQueueMessage,
  signedServiceHeaders,
} from "@/lib/indexing/queue-protocol";

export async function enqueueWithManagedQueue(
  message: IndexingQueueMessage,
  input: {
    dispatchUrl?: string;
    signingSecret?: string;
    fetcher?: typeof fetch;
  } = {},
) {
  const dispatchUrl =
      input.dispatchUrl ?? process.env.INDEXING_QUEUE_DISPATCH_URL,
    signingSecret =
      input.signingSecret ?? process.env.INDEXING_QUEUE_INGRESS_SECRET;
  if (!dispatchUrl || !signingSecret)
    throw new Error("INDEXING_QUEUE_NOT_CONFIGURED");
  const body = JSON.stringify(message),
    headers = await signedServiceHeaders({
      secret: signingSecret,
      method: "POST",
      url: dispatchUrl,
      body,
    }),
    response = await (input.fetcher ?? fetch)(dispatchUrl, {
      method: "POST",
      headers,
      body,
    });
  await response.arrayBuffer();
  if (!response.ok) throw new Error("INDEXING_QUEUE_ENQUEUE_FAILED");
}
