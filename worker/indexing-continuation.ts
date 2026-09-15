type ContinuationResponse = Pick<
  Response,
  "ok" | "headers" | "arrayBuffer"
>;

export interface ContinuationHop {
  jobId: string;
  jobToken: string;
  continuationId: string;
}

/**
 * The in-process chain runs inside one invocation's waitUntil window, so it
 * must finish well before the runtime's ~30s post-response allowance. Each
 * hop is itself time-boxed (SYNC_TOTAL_BUDGET_MS), so this bounds the chain
 * to at most one full hop plus one clipped hop in the degraded path.
 */
export const CONTINUATION_CHAIN_WALL_CLOCK_MS = 20_000;
export const CONTINUATION_CHAIN_MAX_HOPS = 4;
/**
 * A detached continuation request returns only after the fresh invocation's
 * hop completes (~12s time box + persistence), so the timeout must exceed a
 * full hop but still fit the waitUntil window.
 */
export const DETACHED_CONTINUATION_TIMEOUT_MS = 20_000;

export function nextHopFromHeaders(
  headers: Pick<Headers, "get">,
  currentToken: string,
): ContinuationHop | null {
  const jobId = headers.get("x-find-anything-job-id"),
    continuationId = headers.get("x-find-anything-continuation-id"),
    jobToken = headers.get("x-find-anything-job-token") ?? currentToken;
  if (!jobId || !continuationId || !jobToken) return null;
  return { jobId, jobToken, continuationId };
}

/**
 * Advance a persisted continuation without the managed queue.
 *
 * Preferred path: after persisting the dispatch, hand the hop to a DETACHED
 * worker — a real network request back to this site. That request enters a
 * fresh invocation with its own subrequest budget, and that invocation's own
 * wrapper schedules the hop after it, so the chain sustains itself without
 * the dashboard being open. If the platform refuses self-addressed requests,
 * fall back to running the hop in-process and chaining a bounded number of
 * further hops from the continuation headers each hop returns.
 */
export async function executeIndexingContinuation(input: {
  hop: ContinuationHop;
  persistDispatch: (hop: ContinuationHop) => Promise<ContinuationResponse>;
  startDetachedWorker?: (hop: ContinuationHop) => Promise<ContinuationResponse>;
  startInProcessWorker: (hop: ContinuationHop) => Promise<ContinuationResponse>;
  now?: () => number;
}) {
  const now = input.now ?? Date.now,
    startedAt = now();
  let hop: ContinuationHop | null = input.hop,
    hops = 0;
  while (
    hop &&
    hops < CONTINUATION_CHAIN_MAX_HOPS &&
    now() - startedAt < CONTINUATION_CHAIN_WALL_CLOCK_MS
  ) {
    const dispatchResponse = await input.persistDispatch(hop);
    await dispatchResponse.arrayBuffer();
    if (!dispatchResponse.ok)
      throw new Error("CONTINUATION_SCHEDULING_FAILED");
    if (input.startDetachedWorker)
      try {
        const detached = await input.startDetachedWorker(hop);
        await detached.arrayBuffer();
        if (detached.ok)
          return { dispatched: true, detached: true, hops };
        // A refused detached request falls through: the dispatched
        // continuation is still runnable in-process with the same token.
      } catch {
        // Self-addressed requests unavailable on this platform: degrade to
        // the in-process hop below. Nothing was consumed — the continuation
        // is still only `dispatched`.
      }
    const workerResponse = await input.startInProcessWorker(hop);
    if (!workerResponse.ok) {
      await workerResponse.arrayBuffer();
      throw new Error("CONTINUATION_WORKER_START_FAILED");
    }
    hops += 1;
    hop = nextHopFromHeaders(workerResponse.headers, hop.jobToken);
    await workerResponse.arrayBuffer();
  }
  return { dispatched: true, detached: false, hops };
}
