import { decryptSecret, encryptSecret } from "./crypto";
import {
  exportGoogleFile,
  fetchStructuredGoogleFile,
  listAllDriveFiles,
} from "./client";
import { extractDriveContent } from "./extraction";
import {
  beginSync,
  checkpointSync,
  existingSourceFiles,
  finishSync,
  markFileFailed,
  persistExtractedFile,
  reconcileMissingSourceFiles,
  setConnectorStatus,
  updateConnectorTokens,
} from "./repository";
import { refreshAccessToken } from "./oauth";
import {
  isExtractableDriveMimeType,
  planSyncContinuation,
  terminalSyncStatus,
} from "./sync-lifecycle";
export interface StoredConnector {
  id: string;
  workspaceId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: string | null;
}
const SYNC_TOTAL_BUDGET_MS = 12_000;
const SYNC_BATCH_SIZE = 4;
const UNSUPPORTED_BATCH_SIZE = 20;
export async function usableAccessToken(connector: StoredConnector) {
  if (
    connector.tokenExpiresAt &&
    Date.parse(connector.tokenExpiresAt) > Date.now() + 60_000
  )
    return decryptSecret(connector.accessTokenCiphertext);
  if (!connector.refreshTokenCiphertext)
    throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
  const refreshToken = await decryptSecret(connector.refreshTokenCiphertext),
    tokens = await refreshAccessToken(refreshToken),
    accessTokenCiphertext = await encryptSecret(tokens.access_token),
    tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000,
    ).toISOString();
  await updateConnectorTokens(connector.id, {
    accessTokenCiphertext,
    tokenExpiresAt,
  });
  return tokens.access_token;
}
export async function synchronizeGoogleDrive(connector: StoredConnector) {
  const requestStartedAt = Date.now(),
    runId = await beginSync(connector.id, true);
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
    stoppedEarly = false;
  const fallbackReasons: Record<string, number> = {};
  await setConnectorStatus(connector.id, "syncing");
  try {
    const accessToken = await usableAccessToken(connector);
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
    });
    if (inventory.incompleteSearch) throw new Error("GOOGLE_INCOMPLETE_SEARCH");
    discovered = inventory.files.length;
    const previousFiles = await existingSourceFiles(connector.id),
      continuation = planSyncContinuation(inventory.files, previousFiles),
      { previousBySourceId, pendingFiles } = continuation,
      unsupportedFiles = pendingFiles.filter(
        (file) => !isExtractableDriveMimeType(file.mimeType),
      ),
      extractableFiles = pendingFiles.filter((file) =>
        isExtractableDriveMimeType(file.mimeType),
      ),
      processingDeadline = requestStartedAt + SYNC_TOTAL_BUDGET_MS;
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
        if (result.outcome === "unsupported") continue;
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
    await setConnectorStatus(
      connector.id,
      status === "partial" ? "connected" : "error",
      safeErrorCode(error),
    );
    throw error;
  }
}
function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  return message.replace(/[^A-Z0-9_()-]/gi, "_").slice(0, 100);
}
