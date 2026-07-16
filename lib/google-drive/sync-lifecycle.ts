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

export function planSyncContinuation<T extends { id: string; modifiedTime: string }>(
  inventory: T[],
  previousFiles: {
    sourceId: string;
    modifiedAt: string;
    indexStatus: string;
    extractionMode: string | null;
  }[],
) {
  const previousBySourceId = new Map(
      previousFiles.map((file) => [file.sourceId, file]),
    ),
    currentFiles = inventory.filter((file) => {
      const previous = previousBySourceId.get(file.id);
      return (
        previous?.modifiedAt === file.modifiedTime &&
        ["indexed", "unsupported"].includes(previous.indexStatus)
      );
    }),
    pendingFiles = inventory.filter((file) => !currentFiles.includes(file)),
    indexedFiles = currentFiles
      .map((file) => previousBySourceId.get(file.id))
      .filter((file) => file?.indexStatus === "indexed");
  return {
    previousBySourceId,
    pendingFiles,
    filesProcessed: currentFiles.length,
    filesUnchanged: currentFiles.length,
    filesIndexed: indexedFiles.length,
    structuredFiles: indexedFiles.filter(
      (file) => file?.extractionMode === "structured",
    ).length,
    fallbackFiles: indexedFiles.filter(
      (file) => file?.extractionMode === "fallback",
    ).length,
  };
}
