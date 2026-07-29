export type SyncTerminalStatus = "complete" | "partial" | "failed";

const extractableMimeTypes = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "application/pdf",
]);

export function isExtractableDriveMimeType(mimeType: string) {
  return extractableMimeTypes.has(mimeType);
}

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

export const MAX_FILE_RETRIES = 2;
const settledStatuses = ["indexed", "unsupported", "failed"];

export function planSyncContinuation<
  T extends { id: string; modifiedTime: string; md5Checksum?: string },
>(
  inventory: T[],
  previousFiles: {
    sourceId: string;
    modifiedAt: string;
    indexStatus: string;
    extractionMode: string | null;
    contentHash?: string | null;
    retryCount?: number;
  }[],
) {
  const previousBySourceId = new Map(
      previousFiles.map((file) => [file.sourceId, file]),
    ),
    currentFiles = inventory.filter((file) => {
      const previous = previousBySourceId.get(file.id);
      return (
        previous?.modifiedAt === file.modifiedTime &&
        settledStatuses.includes(previous.indexStatus)
      );
    }),
    duplicateFiles = inventory.filter((file) => {
      if (currentFiles.includes(file)) return false;
      const previous = previousBySourceId.get(file.id);
      return Boolean(
        previous &&
          settledStatuses.includes(previous.indexStatus) &&
          file.md5Checksum &&
          previous.contentHash &&
          previous.contentHash === file.md5Checksum,
      );
    }),
    pendingFiles = inventory.filter(
      (file) => !currentFiles.includes(file) && !duplicateFiles.includes(file),
    ),
    settledFiles = [...currentFiles, ...duplicateFiles],
    indexedFiles = settledFiles
      .map((file) => previousBySourceId.get(file.id))
      .filter((file) => file?.indexStatus === "indexed");
  const failedFiles = settledFiles
    .map((file) => previousBySourceId.get(file.id))
    .filter((file) => file?.indexStatus === "failed");
  const unsupportedFiles = settledFiles
    .map((file) => previousBySourceId.get(file.id))
    .filter((file) => file?.indexStatus === "unsupported");
  const retryableFiles = settledFiles.filter((file) => {
    const previous = previousBySourceId.get(file.id);
    return (
      previous?.indexStatus === "failed" &&
      (previous.retryCount ?? 0) < MAX_FILE_RETRIES
    );
  });
  return {
    previousBySourceId,
    pendingFiles,
    duplicateFiles,
    retryableFiles,
    filesProcessed: settledFiles.length,
    filesUnchanged: currentFiles.length,
    filesDuplicate: duplicateFiles.length,
    filesIndexed: indexedFiles.length,
    filesFailed: failedFiles.length,
    filesUnsupported: unsupportedFiles.length,
    structuredFiles: indexedFiles.filter(
      (file) => file?.extractionMode === "structured",
    ).length,
    fallbackFiles: indexedFiles.filter(
      (file) => file?.extractionMode === "fallback",
    ).length,
  };
}

export const COMMON_DRIVE_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "application/pdf",
  "text/plain",
  "text/csv",
]);
export const LARGE_FILE_BYTES = 15 * 1024 * 1024;
export const RECENT_MODIFICATION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PrioritizableDriveFile {
  id: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

export function priorityClass(
  file: PrioritizableDriveFile,
  options: { now?: number; previouslyFailed?: boolean } = {},
) {
  const sizeBytes = Number(file.size ?? 0) || 0;
  if (sizeBytes > LARGE_FILE_BYTES || options.previouslyFailed) return 3;
  const common = COMMON_DRIVE_MIME_TYPES.has(file.mimeType);
  if (common) {
    const modified = Date.parse(file.modifiedTime),
      now = options.now ?? Date.now();
    if (Number.isFinite(modified) && now - modified <= RECENT_MODIFICATION_MS)
      return 0;
    return 1;
  }
  return 2;
}

export function sortPendingDriveFiles<T extends PrioritizableDriveFile>(
  files: T[],
  options: { now?: number; previouslyFailed?: (sourceId: string) => boolean } = {},
) {
  const now = options.now ?? Date.now(),
    previouslyFailed = options.previouslyFailed ?? (() => false),
    ranked = files.map((file) => ({
      file,
      rank: priorityClass(file, {
        now,
        previouslyFailed: previouslyFailed(file.id),
      }),
      sizeBytes: Number(file.size ?? 0) || 0,
      modified: Date.parse(file.modifiedTime) || 0,
    }));
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.sizeBytes - b.sizeBytes ||
      b.modified - a.modified ||
      (a.file.id < b.file.id ? -1 : a.file.id > b.file.id ? 1 : 0),
  );
  return ranked.map((entry) => entry.file);
}
