import type { WorkspaceSearchResponse } from "./core";

export const TRACE_EVENT_SCHEMA_VERSION = "retrieval-replay-v1";

export type RetrievalTraceEventStatus =
  | "executed"
  | "skipped"
  | "unavailable"
  | "failed";

export type RetrievalTraceEvent = {
  sequence: number;
  stage: string;
  label: string;
  startedAt: string | null;
  durationMs: number | null;
  inputCount: number | null;
  outputCount: number | null;
  excludedCount: number | null;
  warningCount: number;
  reasonCodes: string[];
  configurationVersion: string | null;
  status: RetrievalTraceEventStatus;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
};

export function buildRetrievalReplay(input: {
  response: WorkspaceSearchResponse;
  requestStartedAt: number;
  stageLatency?: Record<string, number>;
  receiptCreated?: boolean;
  receiptDurationMs?: number | null;
}): RetrievalTraceEvent[] {
  const { response } = input;
  const excluded = Math.max(
    0,
    Math.max(
      response.coverage.totalKnownFiles,
      response.coverage.authorizedFilesDiscovered,
    ) - response.coverage.filesSearched,
  );
  const citations = response.results.reduce(
    (total, result) => total + result.citations.length,
    0,
  );
  const warnings = response.coverage.incompleteReasons.length;
  const event = (
    value: Omit<RetrievalTraceEvent, "sequence">,
  ): RetrievalTraceEvent => ({ sequence: 0, ...value });
  const unavailable = (stage: string, label: string, summary: string) =>
    event({
      stage,
      label,
      startedAt: null,
      durationMs: null,
      inputCount: null,
      outputCount: null,
      excludedCount: null,
      warningCount: 0,
      reasonCodes: ["INSTRUMENTATION_UNAVAILABLE"],
      configurationVersion: null,
      status: "unavailable",
      summary,
      metadata: {},
    });
  const events: RetrievalTraceEvent[] = [
    unavailable(
      "authentication",
      "Authentication",
      "Authentication succeeded before replay timing began; detailed identity data is not copied into replay events.",
    ),
    event({
      stage: "workspace_authorization",
      label: "Workspace authorization",
      startedAt: new Date(input.requestStartedAt).toISOString(),
      durationMs: input.stageLatency?.authorizationMs ?? null,
      inputCount: 1,
      outputCount: 1,
      excludedCount: 0,
      warningCount: 0,
      reasonCodes: ["WORKSPACE_MEMBERSHIP_CONFIRMED"],
      configurationVersion: "workspace-authorization-v1",
      status: "executed",
      summary: "The authenticated actor was authorized for this workspace.",
      metadata: {},
    }),
    unavailable(
      "connector_selection",
      "Connector selection",
      "A connected workspace source was selected, but independent connector timing was not recorded.",
    ),
    event({
      stage: "permission_inventory",
      label: "Permission inventory",
      startedAt: null,
      durationMs: input.stageLatency?.permissionInventoryMs ?? null,
      inputCount: response.coverage.authorizedFilesDiscovered,
      outputCount: response.coverage.filesSearched,
      excludedCount: excluded,
      warningCount: response.coverage.paginationComplete ? 0 : 1,
      reasonCodes: [
        "CURRENT_AUTHORIZED_INVENTORY_CHECKED",
        ...(excluded ? ["CANDIDATES_FILTERED_WITHOUT_IDENTIFIERS"] : []),
        ...(!response.coverage.paginationComplete ? ["INVENTORY_PAGINATION_INCOMPLETE"] : []),
      ],
      configurationVersion: "permission-inventory-v1",
      status: "executed",
      summary: excluded
        ? `${excluded} source records were excluded without exposing their identities.`
        : "Only records in the current authorized inventory remained eligible.",
      metadata: { paginationComplete: response.coverage.paginationComplete },
    }),
    event({
      stage: "conflict_lookup",
      label: "Conflict lookup",
      startedAt: null,
      durationMs: input.stageLatency?.conflictLookupMs ?? null,
      inputCount: response.results.length,
      outputCount: response.conflicts.length,
      excludedCount: null,
      warningCount: response.conflicts.filter((item) => item.status === "unresolved").length,
      reasonCodes: response.conflicts.length
        ? ["PERSISTED_CONFLICTS_LOADED"]
        : ["NO_RELEVANT_PERSISTED_CONFLICTS"],
      configurationVersion: "deterministic-conflicts-v1",
      status: "executed",
      summary: "Persisted, workspace-scoped conflict records were read; no conflict computation ran in the search path.",
      metadata: {},
    }),
    event({
      stage: "coverage_evaluation",
      label: "Coverage evaluation",
      startedAt: null,
      durationMs: null,
      inputCount: response.coverage.totalKnownFiles,
      outputCount: response.coverage.filesSearched,
      excludedCount: excluded,
      warningCount: warnings,
      reasonCodes: response.coverage.complete
        ? ["OBSERVABLE_COVERAGE_COMPLETE"]
        : response.coverage.incompleteReasons.map(() => "OBSERVABLE_COVERAGE_INCOMPLETE"),
      configurationVersion: response.coverage.snapshot.version,
      status: "executed",
      summary: response.coverage.complete
        ? "Observable connected inventory was complete."
        : "Observable coverage was incomplete; detailed reasons remain in the stored coverage snapshot.",
      metadata: { stale: response.coverage.snapshot.freshness.status === "stale" },
    }),
    event({
      stage: "candidate_generation",
      label: "Candidate generation",
      startedAt: null,
      durationMs: null,
      inputCount: response.coverage.filesSearched,
      outputCount: response.diagnostics.candidateCounts.combined,
      excludedCount: Math.max(0, response.coverage.filesSearched - response.diagnostics.candidateCounts.combined),
      warningCount: 0,
      reasonCodes: ["LITERAL_CANDIDATES_GENERATED"],
      configurationVersion: response.matchingPolicyVersion,
      status: "executed",
      summary: "Candidates were generated from authorized indexed metadata and extracted text.",
      metadata: {},
    }),
    event({
      stage: "permission_filtering",
      label: "Permission filtering",
      startedAt: null,
      durationMs: null,
      inputCount: response.coverage.totalKnownFiles,
      outputCount: response.diagnostics.permissionDecisions.length,
      excludedCount: excluded,
      warningCount: 0,
      reasonCodes: ["FAIL_CLOSED_AUTHORIZED_SET"],
      configurationVersion: "permission-filter-v1",
      status: "executed",
      summary: "Authorization was revalidated before results were eligible; excluded source identities are not recorded here.",
      metadata: {},
    }),
    event({
      stage: "literal_matching",
      label: "Literal matching",
      startedAt: null,
      durationMs: input.stageLatency?.matchingMs ?? null,
      inputCount: response.diagnostics.candidateCounts.combined,
      outputCount: response.totalMatches,
      excludedCount: Math.max(0, response.diagnostics.candidateCounts.combined - response.totalMatches),
      warningCount: 0,
      reasonCodes: [response.totalMatches ? "LITERAL_MATCHES_FOUND" : "ZERO_RESULTS"],
      configurationVersion: response.matchingPolicyVersion,
      status: "executed",
      summary: "Literal title, filename, type, heading, and extracted-content rules were evaluated.",
      metadata: { mode: response.mode },
    }),
    event({
      stage: "semantic_matching",
      label: "Semantic matching",
      startedAt: null,
      durationMs: 0,
      inputCount: 0,
      outputCount: 0,
      excludedCount: 0,
      warningCount: 0,
      reasonCodes: ["SEMANTIC_RETRIEVAL_DISABLED"],
      configurationVersion: null,
      status: "skipped",
      summary: "Semantic retrieval was disabled and contributed no candidates or score.",
      metadata: {},
    }),
    event({
      stage: "ranking",
      label: "Ranking",
      startedAt: null,
      durationMs: null,
      inputCount: response.totalMatches,
      outputCount: response.results.length,
      excludedCount: Math.max(0, response.totalMatches - response.results.length),
      warningCount: 0,
      reasonCodes: [response.mode === "all" ? "FIND_ALL_STABLE_ORDER" : "BEST_MATCHES_DETERMINISTIC_RANKING"],
      configurationVersion: "literal-ranking-v4",
      status: "executed",
      summary: response.mode === "all"
        ? "Find All used exhaustive stable ordering independent of score."
        : "Best Matches used persisted measurable contributions and deterministic tie-breaking.",
      metadata: { mode: response.mode },
    }),
    event({
      stage: "citation_generation",
      label: "Citation generation",
      startedAt: null,
      durationMs: null,
      inputCount: response.results.length,
      outputCount: citations,
      excludedCount: null,
      warningCount: response.results.filter((result) => result.citations.length === 0).length,
      reasonCodes: [citations ? "EXACT_CITATIONS_ATTACHED" : "NO_CITATIONS_RETURNED"],
      configurationVersion: "exact-citations-v1",
      status: "executed",
      summary: "Stored structural locations, excerpts, and evidence hashes were attached where available.",
      metadata: {},
    }),
    event({
      stage: "confidence_calculation",
      label: "Confidence calculation",
      startedAt: null,
      durationMs: input.stageLatency?.confidenceMs ?? null,
      inputCount: response.results.length,
      outputCount: 1,
      excludedCount: 0,
      warningCount: response.confidence.confidenceReductions.length,
      reasonCodes: response.confidence.confidenceReductions.length ? ["CONFIDENCE_DEDUCTIONS_APPLIED"] : ["NO_CONFIDENCE_DEDUCTIONS"],
      configurationVersion: response.confidence.scoringVersion,
      status: "executed",
      summary: "Retrieval confidence was calculated from the stored evidence-quality factors.",
      metadata: { label: response.confidence.label, score: response.confidence.score },
    }),
    event({
      stage: "receipt_creation",
      label: "Receipt creation",
      startedAt: null,
      durationMs: input.receiptDurationMs ?? null,
      inputCount: 1,
      outputCount: input.receiptCreated ? 1 : 0,
      excludedCount: 0,
      warningCount: 0,
      reasonCodes: [input.receiptCreated ? "RECEIPT_PERSISTED" : "RECEIPT_STATUS_UNAVAILABLE"],
      configurationVersion: "search-receipt-v1",
      status: input.receiptCreated ? "executed" : "unavailable",
      summary: input.receiptCreated
        ? "A receipt was persisted and linked to this trace."
        : "Receipt completion had not been recorded when this event snapshot was created.",
      metadata: {},
    }),
  ];
  return events.map((item, index) => ({ ...item, sequence: index + 1 }));
}

export function failedReplayEvent(input: {
  sequence: number;
  stage: string;
  reasonCode: string;
}): RetrievalTraceEvent {
  return {
    sequence: input.sequence,
    stage: input.stage,
    label: input.stage.replaceAll("_", " "),
    startedAt: null,
    durationMs: null,
    inputCount: null,
    outputCount: 0,
    excludedCount: null,
    warningCount: 1,
    reasonCodes: [input.reasonCode],
    configurationVersion: null,
    status: "failed",
    summary: "The recorded retrieval stage failed closed.",
    metadata: {},
  };
}
