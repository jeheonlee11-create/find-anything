import { getDb } from "@/db";
import { latestSyncForConnector } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import type { StoredConnector } from "@/lib/google-drive/sync";
import { conflictsForFiles, unresolvedConflictCount } from "@/lib/conflicts/repository";
import { calculateRetrievalConfidence } from "./confidence";
import {
  searchWorkspaceFiles,
  type WorkspaceFileType,
  type WorkspaceSearchMode,
  type WorkspaceSearchResponse,
} from "./core";
import { queryTerms } from "./matching";
import { loadSearchCandidates, partitionByPermission, workspaceInventory } from "./search-index";

export type SearchStageLatency = {
  /** Google Drive listing for the query-time permission re-check. */
  permissionInventoryMs: number;
  /** D1: file inventory without content, then candidate units from the FTS index. */
  loadFilesMs: number;
  conflictLookupMs: number;
  /** In-memory whole-word matching, ranking, and pagination. */
  matchingMs: number;
  confidenceMs: number;
};

/**
 * The one search pipeline behind the browser route, the /v1 API, and MCP.
 * Throws `GOOGLE_*` errors when Drive permissions cannot be re-checked; callers
 * turn those into a fail-closed response with no results.
 */
export async function runWorkspaceSearch(input: {
  workspaceId: string;
  connector: StoredConnector & { id: string; lastSyncAt: string | null };
  demo: boolean;
  query: string;
  mode: WorkspaceSearchMode;
  fileType: WorkspaceFileType;
  cursor?: string | null;
  pageSize?: number;
}): Promise<{ response: WorkspaceSearchResponse; stageLatency: SearchStageLatency }> {
  const clock = Date.now,
    started = clock();
  const demoSync = input.demo ? await latestSyncForConnector(input.connector.id) : null,
    permissionInventory = input.demo
      ? { sourceIds: undefined, filesDiscovered: demoSync?.filesDiscovered ?? 0, paginationComplete: demoSync?.paginationComplete ?? false }
      : await currentAuthorizedDriveSourceIds(input.connector);
  const permissionDone = clock();

  const db = await getDb(),
    inventory = await workspaceInventory(db, input.workspaceId),
    { allowed, denied } = partitionByPermission(inventory, permissionInventory.sourceIds),
    searchable = allowed.filter((row) => row.searchableStatus === "searchable"),
    candidates = await loadSearchCandidates(db, { workspaceId: input.workspaceId, files: searchable, terms: queryTerms(input.query) });
  const filesDone = clock();

  const detectedConflicts = await conflictsForFiles(input.workspaceId, searchable.map((file) => file.id)),
    unresolvedFileIds = new Set(detectedConflicts.filter((item) => item.status === "unresolved").flatMap((item) => [item.leftFileId, item.rightFileId])),
    authoritativeFileIds = new Set(
      detectedConflicts
        .filter((item) => item.status === "authoritative_source" && item.decision?.authoritativeFileId)
        .map((item) => String(item.decision.authoritativeFileId)),
    );
  const conflictsDone = clock();

  const response = searchWorkspaceFiles({
    workspaceId: input.workspaceId,
    files: candidates.files,
    query: input.query,
    mode: input.mode,
    fileType: input.fileType,
    cursor: input.cursor,
    pageSize: input.pageSize,
    permissionContext: {
      authorizedFilesDiscovered: permissionInventory.filesDiscovered,
      paginationComplete: permissionInventory.paginationComplete,
      lastSuccessfulSyncAt: input.connector.lastSyncAt,
      knownRemovedOrUnauthorized: demoSync?.filesRemoved ?? 0,
      method: input.demo ? "demo_fixture" : "drive_inventory",
      deniedStoredFiles: denied.length,
    },
    coverageRows: allowed,
    rankingContext: { unresolvedConflictFileIds: unresolvedFileIds, authoritativeFileIds, conflictAssessmentComplete: true },
  });
  const matchingDone = clock();

  const resultIds = new Set(response.results.map((result) => result.id));
  response.conflicts = detectedConflicts.filter((item) => resultIds.has(item.leftFileId) || resultIds.has(item.rightFileId));
  response.confidence = calculateRetrievalConfidence({
    coverage: response.coverage,
    results: response.results,
    permissionDecisionCount: response.diagnostics.permissionSummary.evaluated,
    connector: { searched: 1, expectedConfigured: 1 },
    unresolvedConflictCount: unresolvedConflictCount(response.conflicts),
    conflictAssessmentComplete: true,
    retrievalMode: "literal",
  });
  const confidenceDone = clock();

  return {
    response,
    stageLatency: {
      permissionInventoryMs: permissionDone - started,
      loadFilesMs: filesDone - permissionDone,
      conflictLookupMs: conflictsDone - filesDone,
      matchingMs: matchingDone - conflictsDone,
      confidenceMs: confidenceDone - matchingDone,
    },
  };
}
