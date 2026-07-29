import { decryptSecret, encryptSecret } from "./crypto";
import {
  exportGoogleFile,
  fetchStructuredGoogleFile,
  listAllDriveFiles,
} from "./client";
import { extractDriveContent } from "./extraction";
import {
  beginSync,
  acquireTokenRefreshLease,
  checkpointSync,
  existingSourceFiles,
  finishSync,
  markFileFailed,
  persistExtractedFile,
  reconcileMissingSourceFiles,
  refreshedConnectorToken,
  releaseTokenRefreshLease,
  setConnectorStatus,
  updateConnectorTokens,
} from "./repository";
import { GoogleOAuthError, refreshAccessToken } from "./oauth";
import {
  isExtractableDriveMimeType,
  planSyncContinuation,
  terminalSyncStatus,
} from "./sync-lifecycle";
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
const SYNC_BATCH_SIZE = 10;
const UNSUPPORTED_BATCH_SIZE = 20;
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
    stoppedEarly = false;
  const fallbackReasons: Record<string, number> = {};
  await setConnectorStatus(connector.id, "syncing");
  try {
    await reportProgress(onProgress, {
      stage: "verifying_authorization",
      discoveryStatus: "not_started",
      filesDiscovered: 0,
      filesProcessed: 0,
      filesIndexed: 0,
      filesUnsupported: 0,
      filesInaccessible: 0,
      filesFailed: 0,
      structuredFiles: 0,
      fallbackFiles: 0,
      paginationComplete: false,
    });
    const accessToken = await usableAccessToken(connector);
    logIndexingEvent("discovery_started", {
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      stage: "discovering",
    });
    await reportProgress(onProgress, {
      stage: "discovering",
      discoveryStatus: "running",
      filesDiscovered: 0,
      filesProcessed: 0,
      filesIndexed: 0,
      filesUnsupported: 0,
      filesInaccessible: 0,
      filesFailed: 0,
      structuredFiles: 0,
      fallbackFiles: 0,
      paginationComplete: false,
    });
    const inventory = await listAllDriveFiles(accessToken, async (progress) => {
      discovered = progress.filesDiscovered;
      paginationComplete = progress.paginationComplete;
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
        stage: progress.paginationComplete
          ? "discovery_complete"
          : "discovering",
        discoveryStatus: progress.paginationComplete ? "complete" : "running",
        filesDiscovered: discovered,
        filesProcessed,
        filesIndexed: indexed,
        filesUnsupported,
        filesInaccessible: filesRemoved,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
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
    logIndexingEvent("discovery_completed", {
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      discoveredCount: discovered,
      stage: "discovery_complete",
    });
    const previousFiles = await existingSourceFiles(connector.id),
      continuation = planSyncContinuation(inventory.files, previousFiles),
      { previousBySourceId, pendingFiles } = continuation,
      unsupportedFiles = pendingFiles.filter(
        (file) => !isExtractableDriveMimeType(file.mimeType),
      ),
      extractableFiles = pendingFiles.filter((file) =>
        isExtractableDriveMimeType(file.mimeType),
      ),
      processingDeadline = Date.now() + SYNC_TOTAL_BUDGET_MS;
    filesProcessed = continuation.filesProcessed;
    filesUnchanged = continuation.filesUnchanged;
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
      stage: "indexing",
      discoveryStatus: "complete",
      filesDiscovered: discovered,
      filesProcessed,
      filesIndexed: indexed,
      filesUnsupported,
      filesInaccessible: filesRemoved,
      filesFailed: failed,
      structuredFiles,
      fallbackFiles,
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
        filesDeferred: Math.max(0, discovered - filesProcessed),
        continuationNeeded: true,
      };
    }
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
        stage: "indexing",
        discoveryStatus: "complete",
        filesDiscovered: discovered,
        filesProcessed,
        filesIndexed: indexed,
        filesUnsupported,
        filesInaccessible: filesRemoved,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        paginationComplete: true,
      });
    }
    for (let offset = 0; offset < extractableFiles.length; offset += SYNC_BATCH_SIZE) {
      if (Date.now() >= processingDeadline) {
        stoppedEarly = true;
        break;
      }
      const batch = extractableFiles.slice(offset, offset + SYNC_BATCH_SIZE);
      await Promise.all(
        batch.map((file) =>
          markFileFailed({
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            file,
            errorCode: "SYNC_FILE_INTERRUPTED",
          }),
        ),
      );
      const results = await Promise.all(
          batch.map(async (file) => {
            const previous = previousBySourceId.get(file.id);
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
                return { outcome: "unsupported" as const, previous: Boolean(previous) };
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
                previous: Boolean(previous),
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
              return { outcome: "failed" as const, errorCode };
            }
          }),
        );
      for (const result of results) {
        filesProcessed += 1;
        if (result.outcome === "failed") {
          failed += 1;
          continue;
        }
        if (result.outcome === "unsupported") {
          filesUnsupported += 1;
          continue;
        }
        indexed += 1;
        if (result.structured) structuredFiles += 1;
        else if (result.fallbackReason) {
          fallbackFiles += 1;
          fallbackReasons[result.fallbackReason] =
            (fallbackReasons[result.fallbackReason] ?? 0) + 1;
        }
        if (result.previous) filesUpdated += 1;
        else filesAdded += 1;
      }
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
        stage: "indexing",
        discoveryStatus: "complete",
        filesDiscovered: discovered,
        filesProcessed,
        filesIndexed: indexed,
        filesUnsupported,
        filesInaccessible: filesRemoved,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        paginationComplete: true,
      });
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
      filesDeferred: Math.max(0, pendingFiles.length - (filesProcessed - filesUnchanged)),
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
