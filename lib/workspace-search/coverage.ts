import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sourceFiles, syncRuns } from "@/db/schema";
import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { buildCoverageSnapshot } from "./coverage-map";

/**
 * Inventory coverage = processed current inventory records / authorized records discovered.
 * Processing coverage excludes no file type; searchable coverage uses only supported/eligible files.
 * Content extraction coverage = files with searchable extracted content / supported/eligible files.
 */
export async function liveWorkspaceCoverage(workspaceId: string) {
  const connector = await connectorForWorkspace(workspaceId);
  if (!connector) {
    const snapshot = buildCoverageSnapshot({ authorization: "unavailable", authorizedDiscovered: 0, knownInventoryRows: 0, indexed: 0, searchable: 0, failed: 0, pending: 0, unsupported: 0, paginationComplete: false, lastSuccessfulSyncAt: null });
    return { ...snapshot, workspaceId, snapshot };
  }
  if (connector.status !== "connected") {
    const snapshot = buildCoverageSnapshot({ authorization: connector.status === "reauthorization_required" ? "reauthorization_required" : "unavailable", authorizedDiscovered: 0, knownInventoryRows: 0, indexed: 0, searchable: 0, failed: 0, pending: 0, unsupported: 0, paginationComplete: false, lastSuccessfulSyncAt: connector.lastSyncAt });
    return { ...snapshot, workspaceId, snapshot };
  }
  const inventory = await currentAuthorizedDriveSourceIds(connector),
    db = await getDb(),
    rows = await db
      .select({
        sourceId: sourceFiles.sourceId,
        indexStatus: sourceFiles.indexStatus,
        searchableStatus: sourceFiles.searchableStatus,
        extractionMode: sourceFiles.extractionMode,
        updatedAt: sourceFiles.updatedAt,
      })
      .from(sourceFiles)
      .where(
        and(
          eq(sourceFiles.workspaceId, workspaceId),
          eq(sourceFiles.connectorId, connector.id),
          eq(sourceFiles.trashed, false),
        ),
      ),
    current = rows.filter((row) => inventory.sourceIds.has(row.sourceId)),
    count = (status: string) => current.filter((file) => file.indexStatus === status).length,
    indexed = count("indexed"),
    failed = count("failed"),
    pending = count("pending"),
    unsupported = count("unsupported"),
    processed = indexed + failed + unsupported,
    eligibleSupported = indexed + failed + pending,
    searchable = current.filter((file) => file.searchableStatus === "searchable").length,
    structural = current.filter((file) => file.extractionMode === "structured").length,
    fallback = current.filter((file) => file.extractionMode === "fallback").length,
    latest = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.connectorId, connector.id))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)
      .then((items) => items[0] ?? null),
    reasons = [
      !inventory.paginationComplete ? "Drive inventory pagination did not complete." : null,
      failed ? `${failed} supported files failed indexing.` : null,
      pending ? `${pending} supported files are pending indexing.` : null,
      unsupported ? `${unsupported} files use formats that are not currently searchable.` : null,
    ].filter(Boolean);
  const snapshot = buildCoverageSnapshot({
    authorization: "authorized",
    authorizedDiscovered: inventory.filesDiscovered,
    knownInventoryRows: current.length,
    indexed,
    searchable,
    failed,
    pending,
    unsupported,
    knownRemovedOrUnauthorized: latest?.filesRemoved ?? 0,
    paginationComplete: inventory.paginationComplete,
    lastSuccessfulSyncAt: connector.lastSyncAt,
  });
  return {
    ...snapshot,
    workspaceId,
    counts: {
      authorizedDiscovered: inventory.filesDiscovered,
      processed,
      searchable,
      indexed,
      structural,
      fallback,
      unsupported,
      failed,
      pending,
      eligibleSupported,
      deletedOrUnauthorized: latest?.filesRemoved ?? 0,
    },
    metrics: {
      inventoryCoverage: ratio(processed, inventory.filesDiscovered),
      processingCoverage: ratio(processed, inventory.filesDiscovered),
      searchableCoverage: ratio(searchable, eligibleSupported),
      contentExtractionCoverage: ratio(indexed, eligibleSupported),
      failureRate: ratio(failed, eligibleSupported),
      unsupportedRate: ratio(unsupported, inventory.filesDiscovered),
    },
    paginationComplete: inventory.paginationComplete,
    inventoryComplete:
      inventory.paginationComplete && processed === inventory.filesDiscovered,
    searchCoverageComplete: failed === 0 && pending === 0,
    lastSuccessfulSyncAt: connector.lastSyncAt,
    lastVerifiedAt: new Date().toISOString(),
    freshnessSeconds: connector.lastSyncAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(connector.lastSyncAt)) / 1000))
      : null,
    complete: reasons.length === 0,
    incompleteReasons: reasons,
    snapshot,
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}
