export const COVERAGE_SNAPSHOT_VERSION = "workspace-coverage-v1";

export type CoverageSnapshot = {
  version: typeof COVERAGE_SNAPSHOT_VERSION;
  observedAt: string;
  status: "complete" | "partial" | "blocked" | "not_connected";
  authorization: "authorized" | "reauthorization_required" | "unavailable";
  counts: {
    authorizedDiscovered: number;
    knownInventoryRows: number;
    indexed: number;
    searchable: number;
    failed: number;
    pending: number;
    unsupported: number;
    knownRemovedOrUnauthorized: number;
  };
  metrics: {
    knownSourceCoverage: number | null;
    indexingSuccess: number | null;
    searchableCoverage: number | null;
    permissionAccessibility: number | null;
  };
  freshness: { lastSuccessfulSyncAt: string | null; ageSeconds: number | null; status: "fresh" | "aging" | "stale" | "unknown" };
  paginationComplete: boolean;
  incompleteReasons: string[];
  limitations: string[];
};

export function buildCoverageSnapshot(input: {
  authorization: CoverageSnapshot["authorization"];
  authorizedDiscovered: number;
  knownInventoryRows: number;
  indexed: number;
  searchable: number;
  failed: number;
  pending: number;
  unsupported: number;
  knownRemovedOrUnauthorized?: number;
  paginationComplete: boolean;
  lastSuccessfulSyncAt: string | null;
  observedAt?: string;
}): CoverageSnapshot {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const ageSeconds = input.lastSuccessfulSyncAt
    ? Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(input.lastSuccessfulSyncAt)) / 1000))
    : null;
  const freshnessStatus = ageSeconds === null ? "unknown" : ageSeconds <= 86_400 ? "fresh" : ageSeconds <= 604_800 ? "aging" : "stale";
  const knownRemovedOrUnauthorized = input.knownRemovedOrUnauthorized ?? 0;
  const eligible = input.indexed + input.failed + input.pending;
  const terminal = input.indexed + input.failed;
  const reasons = [
    input.authorization !== "authorized" ? "The configured connector is not currently authorized." : null,
    !input.paginationComplete ? "Authorized inventory pagination is incomplete." : null,
    input.knownInventoryRows < input.authorizedDiscovered ? `${input.authorizedDiscovered - input.knownInventoryRows} observable inventory files have not reached a stored indexing record.` : null,
    input.pending ? `${input.pending} supported files are pending indexing.` : null,
    input.failed ? `${input.failed} supported files failed indexing.` : null,
    input.unsupported ? `${input.unsupported} files use unsupported formats.` : null,
    knownRemovedOrUnauthorized ? `${knownRemovedOrUnauthorized} previously known files were removed or are no longer authorized.` : null,
    freshnessStatus === "stale" ? "The latest successful sync is more than seven days old." : null,
  ].filter(Boolean) as string[];
  const status: CoverageSnapshot["status"] = input.authorization === "unavailable"
    ? "not_connected"
    : input.authorization !== "authorized"
      ? "blocked"
      : reasons.length ? "partial" : "complete";
  return {
    version: COVERAGE_SNAPSHOT_VERSION,
    observedAt,
    status,
    authorization: input.authorization,
    counts: { authorizedDiscovered: input.authorizedDiscovered, knownInventoryRows: input.knownInventoryRows, indexed: input.indexed, searchable: input.searchable, failed: input.failed, pending: input.pending, unsupported: input.unsupported, knownRemovedOrUnauthorized },
    metrics: {
      knownSourceCoverage: ratio(input.knownInventoryRows, input.authorizedDiscovered),
      indexingSuccess: ratio(input.indexed, terminal),
      searchableCoverage: ratio(input.searchable, eligible),
      permissionAccessibility: ratio(input.authorizedDiscovered, input.authorizedDiscovered + knownRemovedOrUnauthorized),
    },
    freshness: { lastSuccessfulSyncAt: input.lastSuccessfulSyncAt, ageSeconds, status: freshnessStatus },
    paginationComplete: input.paginationComplete,
    incompleteReasons: reasons,
    limitations: [
      "Coverage includes only the connected source inventory the application can observe.",
      "A missing Drive item cannot be distinguished as deleted versus permission-revoked without additional Google evidence.",
      "No unconfigured connectors or inaccessible systems are assumed.",
    ],
  };
}

/** Status-only view of one stored file record; never carries content. */
export interface CoverageInventoryRow {
  indexStatus: string;
  searchableStatus?: string | null;
  extractionMode?: string | null;
}

/**
 * The single count of what a workspace's authorized inventory covers, shared
 * by the coverage endpoint and every search response. Rows must include
 * hidden (failed/unsupported) records: counting only searchable rows is what
 * made failures invisible and let a search claim complete coverage.
 */
export function summarizeCoverageInventory(rows: CoverageInventoryRow[], options: { paginationComplete: boolean }) {
  const count = (status: string) => rows.filter((row) => row.indexStatus === status).length,
    indexed = count("indexed"),
    metadataOnly = count("metadata"),
    failed = count("failed"),
    pending = count("pending"),
    unsupported = count("unsupported"),
    incompleteReasons = [
      !options.paginationComplete ? "Drive authorization inventory pagination did not complete." : null,
      failed ? `${failed} files failed indexing.` : null,
      pending ? `${pending} files are pending indexing.` : null,
      metadataOnly ? `${metadataOnly} files are searchable by name only; their content is not indexed yet.` : null,
      unsupported ? `${unsupported} files were skipped because their format is unsupported.` : null,
    ].filter(Boolean) as string[];
  return {
    knownInventoryRows: rows.length,
    indexed,
    metadataOnly,
    failed,
    pending,
    unsupported,
    /** Content-searchable: indexed AND exposed to search. */
    searchable: rows.filter((row) => row.indexStatus === "indexed" && row.searchableStatus === "searchable").length,
    structural: rows.filter((row) => row.extractionMode === "structured").length,
    fallback: rows.filter((row) => row.extractionMode === "fallback").length,
    processed: indexed + failed + unsupported,
    eligibleSupported: indexed + failed + pending,
    incompleteReasons,
    complete: incompleteReasons.length === 0,
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}
