export function nextIndexingAttemptNumber(
  completedContinuationCount: number,
  highestPersistedAttemptNumber: number | null | undefined,
) {
  return Math.max(
    completedContinuationCount + 1,
    (highestPersistedAttemptNumber ?? 0) + 1,
  );
}

export function indexingAccounting(input: {
  discovered: number;
  processed: number;
  indexed: number;
  unsupported: number;
  failed: number;
}) {
  return {
    ...input,
    remaining: Math.max(0, input.discovered - input.processed),
    fullyAccounted:
      input.processed >= input.discovered,
  };
}

export const RATE_SIGNAL_MIN_HOPS = 3;

/**
 * Files/min over the trailing window of completed continuations, computed
 * purely from persisted hop snapshots (`processed_count_at_completion` +
 * `completed_at`). ETA is only reported once at least RATE_SIGNAL_MIN_HOPS
 * completed hops of signal exist — no cosmetic progress.
 */
export function indexingRateFromHops(
  hops: {
    completedAt: string | null;
    processedCountAtCompletion: number | null;
  }[],
  remaining: number,
) {
  const usable = hops
    .filter(
      (hop) =>
        hop.completedAt !== null && hop.processedCountAtCompletion !== null,
    )
    .map((hop) => ({
      completedAt: Date.parse(hop.completedAt as string),
      processed: hop.processedCountAtCompletion as number,
    }))
    .filter((hop) => Number.isFinite(hop.completedAt))
    .sort((a, b) => a.completedAt - b.completedAt);
  const lastCheckpointAt = usable.length
    ? new Date(usable[usable.length - 1].completedAt).toISOString()
    : null;
  if (usable.length < 2)
    return {
      filesPerMinute: null,
      etaSeconds: null,
      completedHops: usable.length,
      lastCheckpointAt,
    };
  const first = usable[0],
    last = usable[usable.length - 1],
    processedDelta = Math.max(0, last.processed - first.processed),
    elapsedMinutes = (last.completedAt - first.completedAt) / 60_000,
    filesPerMinute =
      elapsedMinutes > 0
        ? Math.round((processedDelta / elapsedMinutes) * 10) / 10
        : null;
  const etaSeconds =
    usable.length >= RATE_SIGNAL_MIN_HOPS &&
    filesPerMinute !== null &&
    filesPerMinute > 0
      ? Math.round((remaining / filesPerMinute) * 60)
      : null;
  return {
    filesPerMinute,
    etaSeconds,
    completedHops: usable.length,
    lastCheckpointAt,
  };
}

export function isIndexingJobStale(
  heartbeatAt: string | null | undefined,
  now = Date.now(),
  staleAfterMs = 120_000,
) {
  if (!heartbeatAt) return true;
  const heartbeat = Date.parse(heartbeatAt);
  return !Number.isFinite(heartbeat) || now - heartbeat >= staleAfterMs;
}
