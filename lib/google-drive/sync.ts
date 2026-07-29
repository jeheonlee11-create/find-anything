import { decryptSecret, encryptSecret } from "./crypto";
import {
  exportGoogleFile,
  fetchStructuredGoogleFile,
  listAllDriveFiles,
  type DriveFileMetadata,
} from "./client";
import { extractDriveContent } from "./extraction";
import {
  beginSync,
  acquireTokenRefreshLease,
  checkpointSync,
  existingSourceFiles,
  finishSync,
  markFileFailed,
  persistDiscoveredFileMetadata,
  persistExtractedFile,
  reconcileMissingSourceFiles,
  recordFileRetryAttempts,
  refreshFileMetadataBatch,
  refreshedConnectorToken,
  releaseTokenRefreshLease,
  setConnectorStatus,
  updateConnectorTokens,
} from "./repository";
import { GoogleOAuthError, refreshAccessToken } from "./oauth";
import {
  isExtractableDriveMimeType,
  MAX_FILE_RETRIES,
  planSyncContinuation,
  sortPendingDriveFiles,
  terminalSyncStatus,
} from "./sync-lifecycle";
import {
  classifyPoolSignal,
  runPool,
} from "@/lib/indexing/adaptive-pool";
import {
  enrichFile,
  enrichmentEnabled,
  selectEnrichmentCandidates,
  type EnrichmentEnv,
} from "@/lib/indexing/enrichment";
import type {
  DiscoveryStatus,
  IndexingStage,
} from "@/lib/indexing/state-machine";
import { logIndexingEvent } from "@/lib/observability/indexing-log";
export interface StoredConnector {
  id: string;
  workspaceId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: string | null;
}
const SYNC_TOTAL_BUDGET_MS = 12_000;
const SYNC_BATCH_SIZE = 10; // checkpoint + heartbeat cadence inside the pool
const UNSUPPORTED_BATCH_SIZE = 20;
const WORK_WINDOW_FILES = 500; // ids claimed per continuation hop
const EXTRACTION_POOL_INITIAL = 20;
const EXTRACTION_POOL_MIN = 2;
const EXTRACTION_POOL_MAX = 20;
const settledStatuses = ["indexed", "unsupported", "failed"];
const refreshesInFlight = new Map<string, Promise<string>>();
export type DriveSyncProgress = {
  stage: IndexingStage;
  discoveryStatus: DiscoveryStatus;
  filesDiscovered: number;
  filesProcessed: number;
  filesIndexed: number;
  filesUnsupported: number;
  filesInaccessible: number;
  filesFailed: number;
  structuredFiles: number;
  fallbackFiles: number;
  filesMetadataIndexed: number;
  filesUnchanged: number;
  filesDuplicate: number;
  filesRetried: number;
  paginationComplete: boolean;
};
export async function usableAccessToken(connector: StoredConnector) {
  if (
    connector.tokenExpiresAt &&
    Date.parse(connector.tokenExpiresAt) > Date.now() + 60_000
  )
    return decryptSecret(connector.accessTokenCiphertext);
  const active = refreshesInFlight.get(connector.id);
  if (active) return active;
  const refresh = refreshConnectorAccessToken(connector).finally(() =>
    refreshesInFlight.delete(connector.id),
  );
  refreshesInFlight.set(connector.id, refresh);
  return refresh;
}

async function refreshConnectorAccessToken(connector: StoredConnector) {
  if (!connector.refreshTokenCiphertext) {
    await setConnectorStatus(
      connector.id,
      "reauthorization_required",
      "GOOGLE_REFRESH_TOKEN_MISSING",
    );
    throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
  }
  const leaseOwner = await acquireTokenRefreshLease(connector.id);
  if (!leaseOwner) return waitForConcurrentRefresh(connector.id);
  await setConnectorStatus(connector.id, "token_refreshing");
  try {
    const refreshToken = await decryptSecret(connector.refreshTokenCiphertext),
      tokens = await refreshAccessToken(refreshToken),
      tokenExpiresAt = new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString();
    await updateConnectorTokens(connector.id, {
      accessTokenCiphertext: await encryptSecret(tokens.access_token),
      refreshTokenCiphertext: tokens.refresh_token
        ? await encryptSecret(tokens.refresh_token)
        : undefined,
      tokenExpiresAt,
    });
    await setConnectorStatus(connector.id, "connected", null, false);
    return tokens.access_token;
  } catch (error) {
    const reauthorization =
      error instanceof GoogleOAuthError && error.code === "invalid_grant";
    await setConnectorStatus(
      connector.id,
      reauthorization ? "reauthorization_required" : "error",
      reauthorization
        ? "GOOGLE_REAUTHORIZATION_REQUIRED"
        : "GOOGLE_TOKEN_REFRESH_FAILED",
    );
    throw error;
  } finally {
    await releaseTokenRefreshLease(connector.id, leaseOwner);
  }
}

async function waitForConcurrentRefresh(connectorId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const current = await refreshedConnectorToken(connectorId);
    if (!current) throw new Error("GOOGLE_CONNECTOR_NOT_FOUND");
    if (current.status === "reauthorization_required")
      throw new Error("GOOGLE_REAUTHORIZATION_REQUIRED");
    if (
      current.status === "connected" &&
      current.tokenExpiresAt &&
      Date.parse(current.tokenExpiresAt) > Date.now() + 60_000
    )
      return decryptSecret(current.accessTokenCiphertext);
  }
  throw new Error("GOOGLE_TOKEN_REFRESH_TIMEOUT");
}
export async function synchronizeGoogleDrive(
  connector: StoredConnector,
  onProgress?: (progress: DriveSyncProgress) => Promise<void>,
  options: { discoveryOnly?: boolean } = {},
) {
  const runId = await beginSync(connector.id, true);
  let discovered = 0,
    indexed = 0,
    failed = 0,
    structuredFiles = 0,
    fallbackFiles = 0,
    filesAdded = 0,
    filesUpdated = 0,
    filesUnchanged = 0,
    filesRemoved = 0,
    paginationComplete = false,
    filesProcessed = 0,
    filesUnsupported = 0,
    metadataIndexed = 0,
    duplicates = 0,
    retried = 0,
    stoppedEarly = false;
  const fallbackReasons: Record<string, number> = {};
  const baseProgress = () => ({
    filesDiscovered: discovered,
    filesProcessed,
    filesIndexed: indexed,
    filesUnsupported,
    filesInaccessible: filesRemoved,
    filesFailed: failed,
    structuredFiles,
    fallbackFiles,
    filesMetadataIndexed: metadataIndexed,
    filesUnchanged,
    filesDuplicate: duplicates,
    filesRetried: retried,
  });
  await setConnectorStatus(connector.id, "syncing");
  try {
    await reportProgress(onProgress, {
      ...baseProgress(),
      stage: "verifying_authorization",
      discoveryStatus: "not_started",
      paginationComplete: false,
    });
    const accessToken = await usableAccessToken(connector);
    logIndexingEvent("discovery_started", {
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      stage: "discovering",
    });
    await reportProgress(onProgress, {
      ...baseProgress(),
      stage: "discovering",
      discoveryStatus: "running",
      paginationComplete: false,
    });
    // Snapshot the previously persisted files BEFORE metadata upserts run so
    // timestamp/hash change detection compares against pre-discovery state.
    const previousFiles = await existingSourceFiles(connector.id);
    // Stage 1 (metadata-first): on the discovery hop every page is bulk-upserted
    // as metadata-only source_files rows, so search-by-name is available the
    // moment pagination completes — before any extraction.
    const metadataFirst = options.discoveryOnly !== false;
    const inventory = await listAllDriveFiles(accessToken, async (progress) => {
      discovered = progress.filesDiscovered;
      paginationComplete = progress.paginationComplete;
      if (metadataFirst && progress.pageFiles.length)
        metadataIndexed += await persistDiscoveredFileMetadata({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
          files: progress.pageFiles,
        });
      await checkpointSync(runId, {
        filesDiscovered: discovered,
        filesIndexed: indexed,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        paginationComplete: progress.paginationComplete,
        nextPageToken: progress.nextPageToken,
      });
      await reportProgress(onProgress, {
        ...baseProgress(),
        stage: progress.paginationComplete
          ? "discovery_complete"
          : "discovering",
        discoveryStatus: progress.paginationComplete ? "complete" : "running",
        paginationComplete: progress.paginationComplete,
      });
      logIndexingEvent("discovery_progress", {
        workspaceId: connector.workspaceId,
        connectorId: connector.id,
        discoveredCount: discovered,
        stage: "discovering",
      });
    });
    if (inventory.incompleteSearch) throw new Error("GOOGLE_INCOMPLETE_SEARCH");
    discovered = inventory.files.length;
    metadataIndexed = discovered;
    logIndexingEvent("discovery_completed", {
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      discoveredCount: discovered,
      stage: "discovery_complete",
    });
    const continuation = planSyncContinuation(inventory.files, previousFiles),
      { previousBySourceId, pendingFiles } = continuation,
      unsupportedFiles = pendingFiles.filter(
        (file) => !isExtractableDriveMimeType(file.mimeType),
      ),
      extractableFiles = sortPendingDriveFiles(
        pendingFiles.filter((file) => isExtractableDriveMimeType(file.mimeType)),
        {
          previouslyFailed: (sourceId) =>
            previousBySourceId.get(sourceId)?.indexStatus === "failed",
        },
      ),
      processingDeadline = Date.now() + SYNC_TOTAL_BUDGET_MS;
    filesProcessed = continuation.filesProcessed;
    filesUnchanged = continuation.filesUnchanged;
    duplicates = continuation.filesDuplicate;
    indexed = continuation.filesIndexed;
    failed = continuation.filesFailed;
    structuredFiles = continuation.structuredFiles;
    fallbackFiles = continuation.fallbackFiles;
    await checkpointSync(runId, {
      filesDiscovered: discovered,
      filesIndexed: indexed,
      filesFailed: failed,
      structuredFiles,
      fallbackFiles,
      filesUnchanged,
      paginationComplete: true,
      nextPageToken: null,
    });
    filesUnsupported = continuation.filesUnsupported;
    await reportProgress(onProgress, {
      ...baseProgress(),
      stage: "indexing",
      discoveryStatus: "complete",
      paginationComplete: true,
    });
    if (options.discoveryOnly) {
      await finishSync(runId, {
        status: "partial",
        filesDiscovered: discovered,
        filesIndexed: indexed,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        fallbackReasonsJson: JSON.stringify(fallbackReasons),
        filesAdded,
        filesUpdated,
        filesUnchanged,
        filesRemoved: 0,
        paginationComplete: true,
        errorCode: "DISCOVERY_CHECKPOINT_COMPLETE",
      });
      await setConnectorStatus(
        connector.id,
        "connected",
        "DISCOVERY_CHECKPOINT_COMPLETE",
      );
      return {
        status: "partial" as const,
        runId,
        filesDiscovered: discovered,
        filesIndexed: indexed,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        fallbackReasons,
        filesAdded,
        filesUpdated,
        filesUnchanged,
        filesRemoved: 0,
        paginationComplete: true,
        filesProcessed,
        filesUnsupported,
        filesMetadataIndexed: metadataIndexed,
        filesDuplicate: duplicates,
        filesRetried: retried,
        filesDeferred: Math.max(0, discovered - filesProcessed),
        continuationNeeded: true,
      };
    }
    // Stage 2: hash-identical duplicates only need their metadata refreshed —
    // no re-extraction — so the next hop sees a timestamp match.
    for (
      let offset = 0;
      offset < continuation.duplicateFiles.length;
      offset += UNSUPPORTED_BATCH_SIZE
    )
      await refreshFileMetadataBatch({
        connectorId: connector.id,
        files: continuation.duplicateFiles.slice(
          offset,
          offset + UNSUPPORTED_BATCH_SIZE,
        ),
      });
    type EnrichmentCandidate = {
      id: string;
      name: string;
      mimeType: string;
      unitCount: number;
      file: DriveFileMetadata;
      countedUnsupported: boolean;
    };
    const enrichmentCandidates: EnrichmentCandidate[] = [];
    for (
      let offset = 0;
      offset < unsupportedFiles.length;
      offset += UNSUPPORTED_BATCH_SIZE
    ) {
      if (Date.now() >= processingDeadline) {
        stoppedEarly = true;
        break;
      }
      const batch = unsupportedFiles.slice(
        offset,
        offset + UNSUPPORTED_BATCH_SIZE,
      );
      await Promise.all(
        batch.map((file) =>
          persistExtractedFile({
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            file,
            units: [],
            extractionMode: "unsupported",
            structuralFallbackReason: null,
          }),
        ),
      );
      filesProcessed += batch.length;
      filesUnsupported += batch.length;
      for (const file of batch)
        enrichmentCandidates.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          unitCount: 0,
          file,
          countedUnsupported: true,
        });
      await checkpointSync(runId, {
        filesDiscovered: discovered,
        filesIndexed: indexed,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        filesAdded,
        filesUpdated,
        filesUnchanged,
        paginationComplete: true,
        nextPageToken: null,
      });
      await reportProgress(onProgress, {
        ...baseProgress(),
        stage: "indexing",
        discoveryStatus: "complete",
        paginationComplete: true,
      });
    }
    // Stage 3-5: claim a bounded work window of the highest-priority pending
    // files and extract them through the adaptive pool with per-file
    // transactional checkpoints. Only file handles flow through the pool; each
    // slot fetches, parses, writes, and releases one file's export at a time.
    const claimedWindow = extractableFiles.slice(0, WORK_WINDOW_FILES),
      hopFailures: { file: DriveFileMetadata; retryCountBefore: number }[] = [];
    let completionsSinceCheckpoint = 0,
      checkpointError: unknown = null,
      progressChain = Promise.resolve();
    const queueCheckpoint = () => {
      progressChain = progressChain
        .then(async () => {
          await checkpointSync(runId, {
            filesDiscovered: discovered,
            filesIndexed: indexed,
            filesFailed: failed,
            structuredFiles,
            fallbackFiles,
            fallbackReasonsJson: JSON.stringify(fallbackReasons),
            filesAdded,
            filesUpdated,
            filesUnchanged,
            paginationComplete: true,
            nextPageToken: null,
          });
          await reportProgress(onProgress, {
            ...baseProgress(),
            stage: "indexing",
            discoveryStatus: "complete",
            paginationComplete: true,
          });
        })
        .catch((error: unknown) => {
          checkpointError ??= error;
        });
    };
    const extractFile = async (file: DriveFileMetadata) => {
      const previous = previousBySourceId.get(file.id),
        hadContent = Boolean(
          previous && settledStatuses.includes(previous.indexStatus),
        );
      await markFileFailed({
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        file,
        errorCode: "SYNC_FILE_INTERRUPTED",
      });
      try {
        let structured = null;
        let structuralFallbackReason: string | null = null;
        try {
          structured = await fetchStructuredGoogleFile(accessToken, file);
        } catch (error) {
          structuralFallbackReason = safeErrorCode(error);
        }
        const exported =
          structured ?? (await exportGoogleFile(accessToken, file));
        if (!exported) {
          await persistExtractedFile({
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            file,
            units: [],
            extractionMode: "unsupported",
            structuralFallbackReason,
          });
          return { outcome: "unsupported" as const, hadContent, unitCount: 0 };
        }
        const units = await extractDriveContent(file, exported);
        await persistExtractedFile({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
          file,
          units,
          extractionMode: structured
            ? "structured"
            : structuralFallbackReason
              ? "fallback"
              : "native",
          structuralFallbackReason,
        });
        return {
          outcome: "indexed" as const,
          hadContent,
          unitCount: units.length,
          structured: Boolean(structured),
          fallbackReason: structuralFallbackReason,
        };
      } catch (error) {
        const errorCode = safeErrorCode(error);
        await markFileFailed({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
          file,
          errorCode,
        });
        return {
          outcome: "failed" as const,
          hadContent,
          unitCount: 0,
          errorCode,
        };
      }
    };
    type ExtractionResult = Awaited<ReturnType<typeof extractFile>>;
    const applyResult = (
      file: DriveFileMetadata,
      result: ExtractionResult,
      pass: "main" | "retry",
    ) => {
      if (pass === "main") filesProcessed += 1;
      if (result.outcome === "failed") {
        if (pass === "main") {
          failed += 1;
          hopFailures.push({
            file,
            retryCountBefore:
              previousBySourceId.get(file.id)?.retryCount ?? 0,
          });
        }
      } else if (result.outcome === "unsupported") {
        filesUnsupported += 1;
        if (pass === "retry") failed = Math.max(0, failed - 1);
        enrichmentCandidates.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          unitCount: 0,
          file,
          countedUnsupported: true,
        });
      } else {
        indexed += 1;
        if (pass === "retry") failed = Math.max(0, failed - 1);
        if (result.structured) structuredFiles += 1;
        else if (result.fallbackReason) {
          fallbackFiles += 1;
          fallbackReasons[result.fallbackReason] =
            (fallbackReasons[result.fallbackReason] ?? 0) + 1;
        }
        if (result.hadContent) filesUpdated += 1;
        else filesAdded += 1;
        if (result.unitCount === 0)
          enrichmentCandidates.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            unitCount: 0,
            file,
            countedUnsupported: false,
          });
      }
      completionsSinceCheckpoint += 1;
      if (completionsSinceCheckpoint >= SYNC_BATCH_SIZE) {
        completionsSinceCheckpoint = 0;
        queueCheckpoint();
      }
    };
    const poolOptions = {
      initial: EXTRACTION_POOL_INITIAL,
      min: EXTRACTION_POOL_MIN,
      max: EXTRACTION_POOL_MAX,
      shouldStop: () => Date.now() >= processingDeadline,
      signalOf: (result: ExtractionResult) =>
        result.outcome === "failed"
          ? classifyPoolSignal(result.errorCode)
          : null,
    };
    const mainStats = await runPool(
      claimedWindow,
      async (file) => {
        const result = await extractFile(file);
        applyResult(file, result, "main");
        return result;
      },
      poolOptions,
    );
    await progressChain;
    if (checkpointError) throw checkpointError;
    if (
      mainStats.started < claimedWindow.length ||
      extractableFiles.length > claimedWindow.length
    )
      stoppedEarly = true;
    // Stage 8: a dedicated retry pass runs only after the main queue for this
    // hop fully drained, so retries never block first-pass files.
    const retryCandidates = stoppedEarly
      ? []
      : [
          ...hopFailures
            .filter((entry) => entry.retryCountBefore < MAX_FILE_RETRIES)
            .map((entry) => entry.file),
          ...continuation.retryableFiles,
        ];
    if (retryCandidates.length && Date.now() < processingDeadline) {
      await recordFileRetryAttempts(
        connector.id,
        retryCandidates.map((file) => file.id),
      );
      retried += retryCandidates.length;
      await runPool(
        retryCandidates,
        async (file) => {
          const result = await extractFile(file);
          applyResult(file, result, "retry");
          return result;
        },
        poolOptions,
      );
      await progressChain;
      if (checkpointError) throw checkpointError;
    }
    // Stage 6 (optional, flag-gated): AI enrichment for files the
    // deterministic parsers could not read. Default off — no network calls.
    const enrichmentEnv = process.env as EnrichmentEnv;
    if (!stoppedEarly && enrichmentEnabled(enrichmentEnv)) {
      for (const candidate of selectEnrichmentCandidates(
        enrichmentCandidates,
      )) {
        if (Date.now() >= processingDeadline) break;
        try {
          const exported =
            candidate.mimeType === "application/pdf"
              ? await exportGoogleFile(accessToken, candidate.file)
              : null;
          const units = await enrichFile({
            file: candidate.file,
            data: exported?.data,
            env: enrichmentEnv,
          });
          if (units?.length) {
            await persistExtractedFile({
              connectorId: connector.id,
              workspaceId: connector.workspaceId,
              file: candidate.file,
              units,
              extractionMode: "ai_enriched",
              structuralFallbackReason: null,
            });
            if (candidate.countedUnsupported) {
              filesUnsupported = Math.max(0, filesUnsupported - 1);
              indexed += 1;
            }
          }
        } catch {
          // Enrichment is best-effort; the deterministic result stands.
        }
      }
    }
    filesRemoved = await reconcileMissingSourceFiles(
      connector.id,
      new Set(inventory.files.map((file) => file.id)),
    );
    const status = stoppedEarly
      ? "partial"
      : terminalSyncStatus({
          filesIndexed: indexed,
          filesFailed: failed,
        });
    await finishSync(runId, {
      status,
      filesDiscovered: discovered,
      filesIndexed: indexed,
      filesFailed: failed,
      structuredFiles,
      fallbackFiles,
      fallbackReasonsJson: JSON.stringify(fallbackReasons),
      filesAdded,
      filesUpdated,
      filesUnchanged,
      filesRemoved,
      paginationComplete: true,
      errorCode: stoppedEarly ? "SYNC_TIME_BUDGET_REACHED" : undefined,
    });
    await setConnectorStatus(
      connector.id,
      "connected",
      stoppedEarly
        ? "SYNC_TIME_BUDGET_REACHED"
        : status === "partial"
          ? "SYNC_PARTIAL"
          : null,
    );
    return {
      status,
      runId,
      filesDiscovered: discovered,
      filesIndexed: indexed,
      filesFailed: failed,
      structuredFiles,
      fallbackFiles,
      fallbackReasons,
      filesAdded,
      filesUpdated,
      filesUnchanged,
      filesRemoved,
      paginationComplete: true,
      filesProcessed,
      filesUnsupported,
      filesMetadataIndexed: metadataIndexed,
      filesDuplicate: duplicates,
      filesRetried: retried,
      filesDeferred: Math.max(
        0,
        pendingFiles.length - (filesProcessed - filesUnchanged - duplicates),
      ),
      continuationNeeded: stoppedEarly,
    };
  } catch (error) {
    const status = terminalSyncStatus(
      { filesIndexed: indexed, filesFailed: failed },
      true,
    );
    await finishSync(runId, {
      status,
      filesDiscovered: discovered,
      filesIndexed: indexed,
      filesFailed: failed,
      structuredFiles,
      fallbackFiles,
      fallbackReasonsJson: JSON.stringify(fallbackReasons),
      filesAdded,
      filesUpdated,
      filesUnchanged,
      filesRemoved,
      paginationComplete,
      errorCode: safeErrorCode(error),
    });
    const requiresReauthorization =
      (error instanceof GoogleOAuthError && error.code === "invalid_grant") ||
      safeErrorCode(error) === "GOOGLE_REFRESH_TOKEN_MISSING";
    await setConnectorStatus(
      connector.id,
      requiresReauthorization
        ? "reauthorization_required"
        : status === "partial"
          ? "connected"
          : "error",
      requiresReauthorization
        ? "GOOGLE_REAUTHORIZATION_REQUIRED"
        : safeErrorCode(error),
    );
    throw error;
  }
}

async function reportProgress(
  callback: ((progress: DriveSyncProgress) => Promise<void>) | undefined,
  progress: DriveSyncProgress,
) {
  if (callback) await callback(progress);
}
function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  return message.replace(/[^A-Z0-9_()-]/gi, "_").slice(0, 100);
}
