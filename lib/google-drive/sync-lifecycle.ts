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
    updatedAt?: string;
  }[],
  options: {
    /**
     * ISO start of the current indexing job. Rows settled at or after it were
     * settled BY THIS RUN, so they are not "unchanged since a prior sync" —
     * reporting them as unchanged is how a fresh 10k job claimed ~9,500
     * unchanged files it had just indexed itself.
     */
    runStartedAt?: string | null;
  } = {},
) {
  const previousBySourceId = new Map(
      previousFiles.map((file) => [file.sourceId, file]),
    ),
    runStartedAt = options.runStartedAt
      ? Date.parse(options.runStartedAt)
      : null,
    settledByPriorRun = (previous?: { updatedAt?: string }) => {
      if (runStartedAt === null || !Number.isFinite(runStartedAt)) return true;
      const updated = Date.parse(previous?.updatedAt ?? "");
      return !Number.isFinite(updated) || updated < runStartedAt;
    },
    currentFiles: T[] = [],
    unchangedFiles: T[] = [],
    duplicateFiles: T[] = [],
    pendingFiles: T[] = [],
    settledFiles: T[] = [];
  // Single O(n) classification pass — this plan runs per continuation hop on
  // 10k+ file inventories.
  for (const file of inventory) {
    const previous = previousBySourceId.get(file.id),
      settled = Boolean(
        previous && settledStatuses.includes(previous.indexStatus),
      );
    if (settled && previous?.modifiedAt === file.modifiedTime) {
      currentFiles.push(file);
      settledFiles.push(file);
      if (settledByPriorRun(previous)) unchangedFiles.push(file);
    } else if (
      // Duplicate ONLY against content this pipeline actually extracted and
      // persisted. `index_status === "indexed"` is written in the same
      // transactional batch as the file_versions row and the checksum, so a
      // never-extracted (metadata/failed/unsupported) row can never be
      // classified as a duplicate and have its re-extraction signal consumed.
      previous?.indexStatus === "indexed" &&
      file.md5Checksum &&
      previous.contentHash &&
      previous.contentHash === file.md5Checksum
    ) {
      duplicateFiles.push(file);
      settledFiles.push(file);
    } else pendingFiles.push(file);
  }
  const indexedFiles = settledFiles
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
    /** Skipped because they were already settled by a PRIOR run. */
    filesUnchanged: unchangedFiles.length,
    /** Already settled, but by an earlier hop of the run in progress. */
    filesSettledThisRun: currentFiles.length - unchangedFiles.length,
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
/**
 * Memory admission for the extraction pool. A concurrency cap alone does not
 * bound memory: 20 slots × a 50 MB export is 1 GB inside a 128 MB isolate, and
 * because hop ordering is deterministic every recovered hop rebuilt the same
 * fatal window. Files are admitted by aggregate in-flight bytes, and anything
 * above the per-file cap is settled with a distinct, counted status instead of
 * being retried into the same crash forever.
 */
export const MAX_IN_FLIGHT_EXTRACTION_BYTES = 32 * 1024 * 1024;
export const MAX_EXTRACTABLE_FILE_BYTES = 24 * 1024 * 1024;
export const OVERSIZED_FILE_ERROR_CODE = "FILE_TOO_LARGE_TO_EXTRACT";

/**
 * Google-native Docs, Slides, and Sheets report no `size`: their bytes only
 * exist once exported. Their reads are capped at MAX_NATIVE_EXPORT_BYTES (see
 * readBoundedBody in client.ts), so that cap is their honest worst case for
 * memory admission. Counting them as 0 bytes let 20 large native exports into
 * the pool at once.
 */
export const MAX_NATIVE_EXPORT_BYTES = 4 * 1024 * 1024;

export function driveFileBytes(file: { size?: string }) {
  const bytes = Number(file.size ?? 0);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

/** Bytes to reserve in the extraction pool for one file. */
export function extractionWeight(file: { size?: string; mimeType?: string }) {
  const bytes = driveFileBytes(file);
  if (bytes > 0) return bytes;
  return file.mimeType?.startsWith("application/vnd.google-apps.") ? MAX_NATIVE_EXPORT_BYTES : 0;
}

export function isOversizedForExtraction(
  file: { size?: string },
  cap = MAX_EXTRACTABLE_FILE_BYTES,
) {
  return driveFileBytes(file) > cap;
}

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
