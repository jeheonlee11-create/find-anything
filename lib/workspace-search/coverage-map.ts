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

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}
