export type SyncTerminalStatus = "complete" | "partial" | "failed";

export interface SyncCounters {
  filesDiscovered: number;
  filesIndexed: number;
  filesFailed: number;
  structuredFiles: number;
  fallbackFiles: number;
}

export const STALE_SYNC_AFTER_MS = 5 * 60_000;

export function isStaleSync(
  startedAt: string,
  now = Date.now(),
  staleAfterMs = STALE_SYNC_AFTER_MS,
) {
  const started = Date.parse(startedAt);
  return !Number.isFinite(started) || now - started >= staleAfterMs;
}

export function terminalSyncStatus(
  counters: Pick<SyncCounters, "filesIndexed" | "filesFailed">,
  fatal = false,
): SyncTerminalStatus {
  if (fatal) return counters.filesIndexed > 0 ? "partial" : "failed";
  if (counters.filesFailed > 0)
    return counters.filesIndexed > 0 ? "partial" : "failed";
  return "complete";
}

export function reconcileInterruptedRun(
  run: { filesDiscovered: number; paginationComplete: boolean },
  files: {
    indexStatus: string;
    extractionMode: string | null;
    trashed: boolean;
  }[],
) {
  const current = files.filter((file) => !file.trashed),
    filesIndexed = current.filter(
      (file) => file.indexStatus === "indexed",
    ).length,
    filesFailed = current.filter(
      (file) => file.indexStatus === "failed",
    ).length,
    structuredFiles = current.filter(
      (file) =>
        file.indexStatus === "indexed" && file.extractionMode === "structured",
    ).length,
    fallbackFiles = current.filter(
      (file) =>
        file.indexStatus === "indexed" && file.extractionMode === "fallback",
    ).length;
  return {
    status: terminalSyncStatus({ filesIndexed, filesFailed }, true),
    filesDiscovered: Math.max(run.filesDiscovered, current.length),
    filesIndexed,
    filesFailed,
    structuredFiles,
    fallbackFiles,
    paginationComplete: run.paginationComplete,
  };
}
