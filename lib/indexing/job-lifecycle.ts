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
      input.discovered > 0 && input.processed >= input.discovered,
  };
}
