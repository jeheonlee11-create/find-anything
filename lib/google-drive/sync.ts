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
  countConnectorSourceFiles,
  existingSourceFiles,
  finishSync,
  latestDiscoveryCheckpoint,
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
import { refreshAccessToken } from "./oauth";
import {
  classifyConnectorFailure,
  hasAcceptedDriveScope,
  isUsableConnectorStatus,
} from "./connector-health";
import {
  driveFileBytes,
  isExtractableDriveMimeType,
  isOversizedForExtraction,
  MAX_FILE_RETRIES,
  MAX_IN_FLIGHT_EXTRACTION_BYTES,
  OVERSIZED_FILE_ERROR_CODE,
  planSyncContinuation,
  sortPendingDriveFiles,
  terminalSyncStatus,
} from "./sync-lifecycle";
import {
  classifyPoolSignal,
  runPool,
} from "@/lib/indexing/adaptive-pool";
import {
  createSubrequestBudget,
  SUBREQUESTS_PER_FILE,
  workWindowFromBudget,
  type SubrequestBudget,
  type SubrequestBudgetEnv,
} from "@/lib/indexing/subrequest-budget";
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
// Upper bound on a hop's work window. The ACTUAL window is derived from the
// remaining Workers subrequest budget (see workWindowFromBudget) — a hardcoded
// window is what blew the subrequest limit and stalled large drives.
const WORK_WINDOW_MAX_FILES = 500;
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
  filesOversized: number;
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
      tokens = await refreshAccessToken(refreshToken);
    if (!hasAcceptedDriveScope(tokens.scope))
      throw new Error("GOOGLE_REQUIRED_SCOPE_MISSING");
    const tokenExpiresAt = new Date(
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
    // invalid_grant / revoked / missing scope -> reauthorization_required.
    // A transient failure (Google 5xx, 429, network) leaves the connector
    // `connected` with the code recorded, so the next request simply retries
    // the refresh instead of search staying disabled until a manual resync.
    const failure = classifyConnectorFailure(error);
    await setConnectorStatus(connector.id, failure.status, failure.code, false);
    throw error;
  } finally {
    await releaseTokenRefreshLease(connector.id, leaseOwner);
  }
}

/**
 * A real Google token-refresh call typically finishes in well under a
 * second, so polling every 250ms for up to 40 attempts (a 10s worst case)
 * only ever added latency: any request landing while the background
 * indexing poll (every 3s) or a search happened to be mid-refresh sat idle
 * far longer than the refresh itself ever took. Poll faster and give up
 * sooner instead of hanging.
 */
async function waitForConcurrentRefresh(connectorId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const current = await refreshedConnectorToken(connectorId);
    if (!current) throw new Error("GOOGLE_CONNECTOR_NOT_FOUND");
    if (current.status === "reauthorization_required")
      throw new Error("GOOGLE_REAUTHORIZATION_REQUIRED");
    if (current.status === "error" || current.status === "revoked")
      throw new Error(current.lastErrorCode ?? "GOOGLE_TOKEN_REFRESH_FAILED");
    if (
      isUsableConnectorStatus(current.status) &&
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
  options: {
    discoveryOnly?: boolean;
    /** Resume Drive pagination from the durable cursor instead of page 1. */
    resumeDiscovery?: boolean;
    /** ISO start of the job, for honest "unchanged since a prior sync". */
    runStartedAt?: string | null;
    env?: SubrequestBudgetEnv;
    budget?: SubrequestBudget;
  } = {},
) {
  // One explicit Workers subrequest budget for the whole hop, covering Drive
  // fetches AND D1 batches. Running out is a durable checkpoint, never a throw.
  const budget =
    options.budget ??
    createSubrequestBudget({
      env: options.env ?? (process.env as SubrequestBudgetEnv),
    });
  const resumeFrom = options.resumeDiscovery
    ? await latestDiscoveryCheckpoint(connector.id)
    : null;
  budget.spend(1);
  const runId = await beginSync(connector.id, true);
  budget.spend(2);
  let discovered = resumeFrom?.discoveredBefore ?? 0,
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
    oversized = 0,
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
    filesOversized: oversized,
  });
  await setConnectorStatus(connector.id, "syncing");
  budget.spend(1);
  try {
    await reportProgress(onProgress, {
      ...baseProgress(),
      stage: "verifying_authorization",
      discoveryStatus: "not_started",
      paginationComplete: false,
    });
    const accessToken = await usableAccessToken(connector);
    budget.spend(1);
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
    budget.spend(1);
    const discoveryDeadline = Date.now() + SYNC_TOTAL_BUDGET_MS;
    // Stage 1 (metadata-first): on the discovery hop every page is bulk-upserted
    // as metadata-only source_files rows, so search-by-name is available the
    // moment pagination completes — before any extraction.
    const metadataFirst = options.discoveryOnly !== false;
    const inventory = await listAllDriveFiles(
      accessToken,
      async (progress) => {
        discovered = progress.filesDiscovered;
        paginationComplete = progress.paginationComplete;
        if (metadataFirst && progress.pageFiles.length)
          await persistDiscoveredFileMetadata({
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            files: progress.pageFiles,
            budget,
          });
        // Per-page durable cursor: the next hop resumes here instead of
        // re-listing from page 1. On extraction hops (which re-list only to
        // rebuild the inventory) the cursor is written just once, when the
        // pass ends or the budget runs out, so pagination does not eat the
        // budget the extraction window is derived from.
        if (
          metadataFirst ||
          progress.paginationComplete ||
          budget.exhausted()
        )
          await checkpointSync(
            runId,
            {
              filesDiscovered: discovered,
              filesIndexed: indexed,
              filesFailed: failed,
              structuredFiles,
              fallbackFiles,
              paginationComplete: progress.paginationComplete,
              nextPageToken: progress.nextPageToken,
            },
            budget,
          );
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
      },
      {
        pageToken: resumeFrom?.pageToken ?? null,
        discoveredBefore: resumeFrom?.discoveredBefore ?? 0,
        onRequest: () => budget.spend(1),
        shouldStop: () => budget.exhausted() || Date.now() >= discoveryDeadline,
      },
    );
    if (inventory.incompleteSearch) throw new Error("GOOGLE_INCOMPLETE_SEARCH");
    metadataIndexed = await countConnectorSourceFiles(connector.id);
    budget.spend(1);
    // A budget- or deadline-limited pass, or a pass that resumed mid-inventory,
    // does NOT hold the whole inventory in memory. Planning, duplicate
    // classification, and tombstoning would all be wrong against a partial
    // list, so this hop ends as an honest, resumable discovery checkpoint.
    if (!inventory.paginationComplete || inventory.resumed) {
      const errorCode = inventory.paginationComplete
        ? "DISCOVERY_CHECKPOINT_COMPLETE"
        : "DISCOVERY_BUDGET_CHECKPOINT";
      await finishSync(
        runId,
        {
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
          paginationComplete: inventory.paginationComplete,
          nextPageToken: inventory.nextPageToken,
          errorCode,
        },
        budget,
      );
      await setConnectorStatus(connector.id, "connected", errorCode);
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
        paginationComplete: inventory.paginationComplete,
        discoveryResumable: !inventory.paginationComplete,
        // This hop never held the full inventory, so its zeros are not facts.
        plannedInventory: false,
        filesProcessed,
        filesUnsupported,
        filesMetadataIndexed: metadataIndexed,
        filesDuplicate: duplicates,
        filesRetried: retried,
        filesOversized: oversized,
        filesDeferred: Math.max(0, discovered - filesProcessed),
        continuationNeeded: true,
        subrequestsSpent: budget.spent,
      };
    }
    discovered = inventory.files.length;
    logIndexingEvent("discovery_completed", {
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      discoveredCount: discovered,
      stage: "discovery_complete",
    });
    const continuation = planSyncContinuation(inventory.files, previousFiles, {
        runStartedAt: options.runStartedAt ?? null,
      }),
      { previousBySourceId, pendingFiles } = continuation,
      unsupportedFiles = pendingFiles.filter(
        (file) => !isExtractableDriveMimeType(file.mimeType),
      ),
      admissibleFiles = sortPendingDriveFiles(
        pendingFiles.filter((file) => isExtractableDriveMimeType(file.mimeType)),
        {
          previouslyFailed: (sourceId) =>
            previousBySourceId.get(sourceId)?.indexStatus === "failed",
        },
      ),
      oversizedFiles = admissibleFiles.filter((file) =>
        isOversizedForExtraction(file),
      ),
      extractableFiles = admissibleFiles.filter(
        (file) => !isOversizedForExtraction(file),
      ),
      processingDeadline = Date.now() + SYNC_TOTAL_BUDGET_MS;
    filesProcessed = continuation.filesProcessed;
    filesUnchanged = continuation.filesUnchanged;
    indexed = continuation.filesIndexed;
    failed = continuation.filesFailed;
    structuredFiles = continuation.structuredFiles;
    fallbackFiles = continuation.fallbackFiles;
    await checkpointSync(
      runId,
      {
        filesDiscovered: discovered,
        filesIndexed: indexed,
        filesFailed: failed,
        structuredFiles,
        fallbackFiles,
        filesUnchanged,
        paginationComplete: true,
        nextPageToken: null,
      },
      budget,
    );
    filesUnsupported = continuation.filesUnsupported;
    await reportProgress(onProgress, {
      ...baseProgress(),
      stage: "indexing",
      discoveryStatus: "complete",
      paginationComplete: true,
    });
    if (options.discoveryOnly) {
      await finishSync(
        runId,
        {
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
          nextPageToken: null,
          errorCode: "DISCOVERY_CHECKPOINT_COMPLETE",
        },
        budget,
      );
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
        discoveryResumable: false,
        plannedInventory: true,
        filesProcessed,
        filesUnsupported,
        filesMetadataIndexed: metadataIndexed,
        filesDuplicate: duplicates,
        filesRetried: retried,
        filesOversized: oversized,
        filesDeferred: Math.max(0, discovered - filesProcessed),
        continuationNeeded: true,
        subrequestsSpent: budget.spent,
      };
    }
    // Stage 2: hash-identical duplicates only need their metadata refreshed —
    // no re-extraction — so the next hop sees a timestamp match. Bounded by the
    // same deadline and subrequest budget as every other loop in the hop.
    for (
      let offset = 0;
      offset < continuation.duplicateFiles.length;
      offset += UNSUPPORTED_BATCH_SIZE
    ) {
      if (Date.now() >= processingDeadline || budget.exhausted()) {
        stoppedEarly = true;
        break;
      }
      const batch = continuation.duplicateFiles.slice(
        offset,
        offset + UNSUPPORTED_BATCH_SIZE,
      );
      await refreshFileMetadataBatch({
        connectorId: connector.id,
        files: batch,
        budget,
      });
      // Only duplicates whose metadata refresh actually committed are counted,
      // so accumulating across hops can never double count.
      duplicates += batch.length;
    }
    // Files too large to hold in a 128 MB isolate are settled with a distinct,
    // counted status instead of being re-admitted into the identical fatal
    // window on every recovered hop.
    for (const file of oversizedFiles) {
      if (Date.now() >= processingDeadline || !budget.canSpend(2)) {
        stoppedEarly = true;
        break;
      }
      await markFileFailed({
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        file,
        errorCode: OVERSIZED_FILE_ERROR_CODE,
        extractionMode: "skipped_too_large",
        terminal: true,
        budget,
      });
      filesProcessed += 1;
      oversized += 1;
      filesUnsupported += 1;
    }
    if (oversizedFiles.length > oversized) stoppedEarly = true;
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
      if (Date.now() >= processingDeadline || budget.exhausted()) {
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
            budget,
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
      await checkpointSync(
        runId,
        {
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
        },
        budget,
      );
      await reportProgress(onProgress, {
        ...baseProgress(),
        stage: "indexing",
        discoveryStatus: "complete",
        paginationComplete: true,
      });
    }
    // Stage 3-5: claim a work window sized by the subrequest budget the hop has
    // left (never a hardcoded 500) and extract the highest-priority pending
    // files through the adaptive pool with per-file transactional checkpoints.
    // Only file handles flow through the pool; each slot fetches, parses,
    // writes, and releases one file's export at a time.
    const workWindow = workWindowFromBudget(budget, {
        perFile: SUBREQUESTS_PER_FILE,
        cap: WORK_WINDOW_MAX_FILES,
      }),
      claimedWindow = extractableFiles.slice(0, workWindow),
      hopFailures: { file: DriveFileMetadata; retryCountBefore: number }[] = [];
    let completionsSinceCheckpoint = 0,
      checkpointError: unknown = null,
      progressChain = Promise.resolve();
    const queueCheckpoint = () => {
      progressChain = progressChain
        .then(async () => {
          await checkpointSync(
            runId,
            {
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
            },
            budget,
          );
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
      // Durable in-progress marker: if this hop dies mid-file the row is
      // already settled as failed, so the next hop's window differs and a
      // repeatedly fatal window cannot rebuild itself identically forever.
      // It is not a user-visible failure, so it records no failure row.
      await markFileFailed({
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        file,
        errorCode: "SYNC_FILE_INTERRUPTED",
        recordFailure: false,
        budget,
      });
      try {
        let structured = null;
        let structuralFallbackReason: string | null = null;
        try {
          budget.spend(1);
          structured = await fetchStructuredGoogleFile(accessToken, file);
        } catch (error) {
          structuralFallbackReason = safeErrorCode(error);
        }
        let exported:
          | Awaited<ReturnType<typeof fetchStructuredGoogleFile>>
          | Awaited<ReturnType<typeof exportGoogleFile>> = structured;
        if (!exported) {
          budget.spend(1);
          exported = await exportGoogleFile(accessToken, file);
        }
        if (!exported) {
          await persistExtractedFile({
            connectorId: connector.id,
            workspaceId: connector.workspaceId,
            file,
            units: [],
            extractionMode: "unsupported",
            structuralFallbackReason,
            budget,
          });
          return { outcome: "unsupported" as const, hadContent, unitCount: 0 };
        }
        const units = await extractDriveContent(file, exported);
        const persisted = await persistExtractedFile({
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
          budget,
        });
        // A zero-unit extraction is STORED as `unsupported` (a scanned PDF is
        // not searchable content), so it must be counted as unsupported too —
        // counting it as indexed made the number contradict the same screen and
        // shrink on the next hop.
        return persisted.indexed
          ? {
              outcome: "indexed" as const,
              hadContent,
              unitCount: units.length,
              structured: Boolean(structured),
              fallbackReason: structuralFallbackReason,
            }
          : { outcome: "unsupported" as const, hadContent, unitCount: 0 };
      } catch (error) {
        const errorCode = safeErrorCode(error);
        await markFileFailed({
          connectorId: connector.id,
          workspaceId: connector.workspaceId,
          file,
          errorCode,
          budget,
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
      // Admission is bounded by aggregate in-flight export bytes as well as by
      // slots, so a window of large PDFs cannot OOM the 128 MB isolate.
      weightOf: (file: DriveFileMetadata) => driveFileBytes(file),
      maxInFlightWeight: MAX_IN_FLIGHT_EXTRACTION_BYTES,
      shouldStop: () =>
        Date.now() >= processingDeadline || !budget.canSpend(SUBREQUESTS_PER_FILE),
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
      await runPool(
        retryCandidates,
        async (file) => {
          // The retry budget is charged per ACTUAL attempt, inside the worker.
          // Charging the whole candidate list up front burned MAX_FILE_RETRIES
          // across two deadline-clipped hops with zero real re-extraction and
          // failed extractable files permanently.
          await recordFileRetryAttempts(connector.id, [file.id], budget);
          retried += 1;
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
        if (Date.now() >= processingDeadline || !budget.canSpend(3)) break;
        try {
          budget.spend(1);
          const exported = await exportGoogleFile(accessToken, candidate.file);
          // No document bytes, no model call: a filename-only prompt leaks the
          // filename for zero extraction value and can never yield content we
          // are entitled to store as extracted.
          if (!exported?.data) continue;
          const units = await enrichFile({
            file: candidate.file,
            data: exported.data,
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
              budget,
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
      budget,
    );
    if (budget.exhausted()) stoppedEarly = true;
    const budgetLimited = budget.exhausted(),
      status = stoppedEarly
        ? "partial"
        : terminalSyncStatus({
            filesIndexed: indexed,
            filesFailed: failed,
          }),
      stopReason = budgetLimited
        ? "SYNC_SUBREQUEST_BUDGET_REACHED"
        : "SYNC_TIME_BUDGET_REACHED";
    // Committed rows, not the in-memory inventory length.
    metadataIndexed = await countConnectorSourceFiles(connector.id);
    budget.spend(1);
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
      nextPageToken: null,
      errorCode: stoppedEarly ? stopReason : undefined,
    });
    await setConnectorStatus(
      connector.id,
      "connected",
      stoppedEarly ? stopReason : status === "partial" ? "SYNC_PARTIAL" : null,
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
      discoveryResumable: false,
      filesProcessed,
      filesUnsupported,
      filesMetadataIndexed: metadataIndexed,
      filesDuplicate: duplicates,
      filesRetried: retried,
      filesOversized: oversized,
      filesDeferred: Math.max(
        0,
        pendingFiles.length - (filesProcessed - filesUnchanged - duplicates),
      ),
      continuationNeeded: stoppedEarly,
      subrequestsSpent: budget.spent,
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
    // Only a permanent failure may leave the connector unusable; a transient
    // one (Drive 5xx, rate limit, timeout) keeps it `connected` for search
    // and the next sync, without recording a successful sync time.
    const failure = classifyConnectorFailure(error);
    await setConnectorStatus(
      connector.id,
      failure.status === "error" && status === "partial"
        ? "connected"
        : failure.status,
      failure.status === "reauthorization_required"
        ? failure.code
        : safeErrorCode(error),
      status === "partial",
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
