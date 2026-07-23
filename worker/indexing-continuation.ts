type ContinuationResponse = Pick<
  Response,
  "ok" | "headers" | "arrayBuffer"
>;

export async function executeIndexingContinuation(input: {
  jobId: string;
  jobToken: string;
  startWorker: () => Promise<ContinuationResponse>;
  scheduleNext: () => Promise<ContinuationResponse>;
}) {
  const response = await input.startWorker(),
    shouldContinue =
      response.ok &&
      response.headers.get("x-find-anything-job-id") === input.jobId &&
      response.headers.get("x-find-anything-job-token") === input.jobToken;
  await response.arrayBuffer();
  if (!response.ok) throw new Error("CONTINUATION_WORKER_START_FAILED");
  if (!shouldContinue) return { started: true, scheduledNext: false };

  const nextResponse = await input.scheduleNext();
  await nextResponse.arrayBuffer();
  if (!nextResponse.ok)
    throw new Error("CONTINUATION_SCHEDULING_FAILED");
  return { started: true, scheduledNext: true };
}
