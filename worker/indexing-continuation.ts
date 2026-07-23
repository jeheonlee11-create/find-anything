type ContinuationResponse = Pick<
  Response,
  "ok" | "headers" | "arrayBuffer"
>;

export async function executeIndexingContinuation(input: {
  jobId: string;
  continuationId: string;
  persistDispatch: () => Promise<ContinuationResponse>;
  startFreshWorker: () => Promise<ContinuationResponse>;
}) {
  const dispatchResponse = await input.persistDispatch();
  await dispatchResponse.arrayBuffer();
  if (!dispatchResponse.ok)
    throw new Error("CONTINUATION_SCHEDULING_FAILED");
  const workerResponse = await input.startFreshWorker();
  await workerResponse.arrayBuffer();
  if (!workerResponse.ok)
    throw new Error("CONTINUATION_WORKER_START_FAILED");
  return { dispatched: true, acknowledged: true };
}
