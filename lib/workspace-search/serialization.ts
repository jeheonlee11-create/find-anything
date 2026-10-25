import type { searchReceipts, retrievalTraces } from "@/db/schema";
type Receipt = typeof searchReceipts.$inferSelect;
type Trace = typeof retrievalTraces.$inferSelect;
export function publicReceipt(row: Receipt) {
  return {
    receiptId: row.id,
    searchId: row.searchId,
    traceId: row.traceId,
    workspaceId: row.workspaceId,
    requestingUserId: row.actorId,
    query: row.query,
    searchMode: row.mode,
    filters: JSON.parse(row.filtersJson),
    matchingPolicyVersion: row.matchingPolicyVersion,
    searchTimestamp: row.searchedAt,
    totalIndexedFiles: row.totalIndexedFiles,
    totalEligibleFiles: row.totalEligibleFiles,
    totalFilesSearched: row.totalFilesSearched,
    totalMatches: row.totalMatches,
    totalReturned: row.totalReturned,
    pendingFiles: row.pendingFiles,
    failedFiles: row.failedFiles,
    excludedFiles: row.excludedFiles,
    completenessStatus: row.completenessStatus,
    incompleteReasons: JSON.parse(row.incompleteReasonsJson),
    resultFileIds: JSON.parse(row.resultFileIdsJson),
    citations: JSON.parse(row.citationsJson),
    searchDurationMs: row.durationMs,
    configurationHash: row.configurationHash,
    indexSnapshotHash: row.indexSnapshotHash,
    resultSetHash: row.resultSetHash,
    retrievalConfidence: row.confidenceJson
      ? JSON.parse(row.confidenceJson)
      : null,
    coverageSnapshot: row.coverageSnapshotJson ? JSON.parse(row.coverageSnapshotJson) : null,
    conflicts: row.conflictSnapshotJson ? JSON.parse(row.conflictSnapshotJson) : [],
    conflictSnapshotVersion: row.conflictSnapshotVersion,
    rankingExplanations: row.rankingSnapshotJson ? JSON.parse(row.rankingSnapshotJson) : null,
    rankingSnapshotVersion: row.rankingSnapshotVersion,
    correlationId: row.correlationId,
  };
}
export function publicTrace(row: Trace) {
  return {
    traceId: row.id,
    searchId: row.searchId,
    workspaceId: row.workspaceId,
    query: row.query,
    normalizedQuery: row.normalizedQuery,
    searchMode: row.mode,
    filters: JSON.parse(row.filtersJson),
    matchingPolicyVersion: row.matchingPolicyVersion,
    candidateCounts: JSON.parse(row.candidateCountsJson),
    duplicatesRemoved: row.duplicatesRemoved,
    permissionDecisions: JSON.parse(row.permissionDecisionsJson),
    thresholdDecisions: JSON.parse(row.thresholdDecisionsJson),
    excludedResults: JSON.parse(row.excludedResultsJson),
    decisionSummary: row.decisionSummaryJson ? JSON.parse(row.decisionSummaryJson) : null,
    finalResultCount: row.finalResultCount,
    latencyByStage: JSON.parse(row.latencyJson),
    coverage: JSON.parse(row.coverageJson),
    coverageSnapshotVersion: row.coverageSnapshotVersion,
    conflicts: row.conflictSnapshotJson ? JSON.parse(row.conflictSnapshotJson) : [],
    conflictSnapshotVersion: row.conflictSnapshotVersion,
    rankingExplanations: row.rankingSnapshotJson ? JSON.parse(row.rankingSnapshotJson) : null,
    rankingSnapshotVersion: row.rankingSnapshotVersion,
    replay: row.traceEventsJson ? {
      schemaVersion: row.traceEventSchemaVersion,
      events: JSON.parse(row.traceEventsJson),
    } : null,
    results: JSON.parse(row.resultsJson),
    stages: JSON.parse(row.stagesJson),
    finalResultOrder: JSON.parse(row.finalResultOrderJson),
    extractionMethods: JSON.parse(row.extractionMethodsJson),
    fallbackErrors: JSON.parse(row.fallbackErrorsJson),
    authorizedFilesConsidered: row.authorizedFilesConsidered,
    retrievalConfidence: row.confidenceJson
      ? JSON.parse(row.confidenceJson)
      : null,
    createdAt: row.createdAt,
    correlationId: row.correlationId,
  };
}
export function receiptCsv(receipt: ReturnType<typeof publicReceipt>) {
  const rows = [
    ["field", "value"],
    ...Object.entries(receipt).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]),
  ];
  return rows
    .map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}
