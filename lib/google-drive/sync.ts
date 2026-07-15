import { decryptSecret, encryptSecret } from "./crypto";
import {
  exportGoogleFile,
  fetchStructuredGoogleFile,
  listAllDriveFiles,
} from "./client";
import { extractDriveContent } from "./extraction";
import {
  beginSync,
  existingSourceFile,
  finishSync,
  markFileFailed,
  persistExtractedFile,
  reconcileMissingSourceFiles,
  setConnectorStatus,
  updateConnectorTokens,
} from "./repository";
import { refreshAccessToken } from "./oauth";
export interface StoredConnector {
  id: string;
  workspaceId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenExpiresAt: string | null;
}
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
  const runId = await beginSync(connector.id);
  let discovered = 0,
    indexed = 0,
    failed = 0,
    structuredFiles = 0,
    fallbackFiles = 0,
    filesAdded = 0,
    filesUpdated = 0,
    filesUnchanged = 0,
    filesRemoved = 0;
  const fallbackReasons: Record<string, number> = {};
  await setConnectorStatus(connector.id, "syncing");
  try {
    const accessToken = await usableAccessToken(connector);
    const inventory = await listAllDriveFiles(accessToken);
    if (inventory.incompleteSearch) throw new Error("GOOGLE_INCOMPLETE_SEARCH");
    discovered = inventory.files.length;
    for (const file of inventory.files) {
      try {
        const previous = await existingSourceFile(connector.id, file.id);
        if (
          previous &&
          previous.modifiedAt === file.modifiedTime &&
          previous.indexStatus === "indexed" &&
          previous.extractionMode === "structured"
        ) {
          filesUnchanged += 1;
          structuredFiles += 1;
          indexed += 1;
          continue;
        }
        let structured = null;
        let structuralFallbackReason: string | null = null;
        try {
          structured = await fetchStructuredGoogleFile(accessToken, file);
        } catch (error) {
          structuralFallbackReason = safeErrorCode(error);
          fallbackReasons[structuralFallbackReason] =
            (fallbackReasons[structuralFallbackReason] ?? 0) + 1;
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
          continue;
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
        if (structured) structuredFiles += 1;
        else if (structuralFallbackReason) fallbackFiles += 1;
        if (previous) filesUpdated += 1;
        else filesAdded += 1;
        indexed += 1;
      } catch (error) {
        failed += 1;
        await markFileFailed({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
          file,
          errorCode: safeErrorCode(error),
        });
      }
    }
    filesRemoved = await reconcileMissingSourceFiles(
      connector.id,
      new Set(inventory.files.map((file) => file.id)),
    );
    await finishSync(runId, {
      status: "complete",
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
    });
    await setConnectorStatus(connector.id, "connected");
    return {
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
    };
  } catch (error) {
    await finishSync(runId, {
      status: "failed",
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
      paginationComplete: false,
      errorCode: safeErrorCode(error),
    });
    await setConnectorStatus(connector.id, "error", safeErrorCode(error));
    throw error;
  }
}
function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  return message.replace(/[^A-Z0-9_()-]/gi, "_").slice(0, 100);
}
