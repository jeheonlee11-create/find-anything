import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { syncRuns } from "@/db/schema";
import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { connectorSearchAccess } from "@/lib/google-drive/connector-health";
import { buildCoverageSnapshot, summarizeCoverageInventory } from "./coverage-map";
import { workspaceCoverageRows } from "./repository";

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
  if (!connectorSearchAccess(connector).allowed) {
    const snapshot = buildCoverageSnapshot({ authorization: connector.status === "reauthorization_required" ? "reauthorization_required" : "unavailable", authorizedDiscovered: 0, knownInventoryRows: 0, indexed: 0, searchable: 0, failed: 0, pending: 0, unsupported: 0, paginationComplete: false, lastSuccessfulSyncAt: connector.lastSyncAt });
    return { ...snapshot, workspaceId, snapshot };
  }
  const inventory = await currentAuthorizedDriveSourceIds(connector),
    db = await getDb(),
    current = await workspaceCoverageRows(workspaceId, inventory.sourceIds, connector.id),
    summary = summarizeCoverageInventory(current, { paginationComplete: inventory.paginationComplete }),
    { indexed, failed, pending, unsupported, processed, eligibleSupported, searchable, structural, fallback } = summary,
    latest = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.connectorId, connector.id))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)
      .then((items) => items[0] ?? null),
    reasons = summary.incompleteReasons;
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
