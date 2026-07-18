import type { WorkspaceSearchResponse } from "./core";

export const RETRIEVAL_CONFIDENCE_VERSION = "retrieval-confidence-v1";
export const RETRIEVAL_CONFIDENCE_CONFIGURATION_VERSION = "2026-07-17";

export type RetrievalConfidenceLabel =
  | "High retrieval confidence"
  | "Moderate retrieval confidence"
  | "Low retrieval confidence";

export interface RetrievalConfidenceFactor {
  key:
    | "source_coverage"
    | "connector_coverage"
    | "permission_completeness"
    | "evidence_count"
    | "evidence_agreement"
    | "evidence_freshness"
    | "structural_citation_quality"
    | "conflict_presence"
    | "inaccessible_source_impact"
    | "retrieval_mode_limitations";
  label: string;
  status: "supporting" | "reducing" | "unknown";
  points: number;
  maxPoints: number;
  measuredValue: number | string | null;
  explanation: string;
}

export interface RetrievalConfidence {
  score: number;
  label: RetrievalConfidenceLabel;
  scoringVersion: string;
  configurationVersion: string;
  calculatedAt: string;
  factors: RetrievalConfidenceFactor[];
  supportingFactors: string[];
  confidenceReductions: string[];
  limitations: string[];
  disclosure: string;
}

export function calculateRetrievalConfidence(input: {
  coverage: WorkspaceSearchResponse["coverage"];
  results: WorkspaceSearchResponse["results"];
  permissionDecisionCount: number;
  connector: { searched: number; expectedConfigured: number };
  unresolvedConflictCount: number | null;
  conflictAssessmentComplete: boolean;
  retrievalMode: "literal";
  now?: Date;
}): RetrievalConfidence {
  const now = input.now ?? new Date();
  const known = Math.max(
      input.coverage.authorizedFilesDiscovered,
      input.coverage.totalKnownFiles,
    ),
    searchableRatio = ratio(input.coverage.indexedFiles, known),
    inaccessible =
      input.coverage.failedFiles +
      input.coverage.pendingFiles +
      input.coverage.unsupportedFiles +
      Math.max(0, known - input.coverage.totalKnownFiles),
    distinctEvidenceFiles = new Set(
      input.results.flatMap((result) =>
        result.citations.map((citation) => citation.fileId),
      ),
    ).size,
    citations = input.results.flatMap((result) => result.citations),
    structuralCitations = citations.filter(
      (citation) =>
        citation.contentHash.length > 0 &&
        citation.excerpt.length > 0 &&
        Object.keys(citation.structuralLocation).length > 0,
    ).length,
    freshnessHours = input.coverage.lastSuccessfulSyncAt
      ? Math.max(
          0,
          (now.getTime() - Date.parse(input.coverage.lastSuccessfulSyncAt)) /
            3_600_000,
        )
      : null,
    sourcePoints = points(20 * searchableRatio),
    connectorRatio = ratio(
      input.connector.searched,
      input.connector.expectedConfigured,
    ),
    connectorPoints = points(10 * connectorRatio),
    permissionsComplete =
      input.coverage.paginationComplete &&
      input.permissionDecisionCount >= input.coverage.totalKnownFiles,
    permissionPoints = permissionsComplete ? 15 : 0,
    evidencePoints = points(15 * Math.min(1, distinctEvidenceFiles / 5)),
    freshnessPoints = freshnessScore(freshnessHours),
    structuralPoints = points(10 * ratio(structuralCitations, citations.length)),
    agreementKnown =
      input.conflictAssessmentComplete && distinctEvidenceFiles >= 2,
    conflicts = input.unresolvedConflictCount ?? 0,
    agreementPoints = agreementKnown ? Math.max(0, 10 - conflicts * 5) : 0,
    conflictPoints = input.conflictAssessmentComplete
      ? conflicts === 0
        ? 5
        : 0
      : 0,
    accessibilityPoints = points(3 * (1 - ratio(inaccessible, known))),
    modePoints = input.retrievalMode === "literal" ? 0 : 2,
    factors: RetrievalConfidenceFactor[] = [
      factor(
        "source_coverage",
        "Source coverage",
        sourcePoints,
        20,
        `${input.coverage.indexedFiles} of ${known}`,
        `${input.coverage.indexedFiles} of ${known} permission-scoped files were indexed and searchable before query filters were applied.`,
      ),
      factor(
        "connector_coverage",
        "Connector coverage",
        connectorPoints,
        10,
        `${input.connector.searched} of ${input.connector.expectedConfigured}`,
        `${input.connector.searched} of ${input.connector.expectedConfigured} configured retrieval connectors were searched. Disconnected systems are not included in this denominator.`,
      ),
      factor(
        "permission_completeness",
        "Permission completeness",
        permissionPoints,
        15,
        permissionsComplete,
        permissionsComplete
          ? "The current permission inventory completed before retrieval and every loaded file received an allow decision."
          : "Permission or inventory evaluation was incomplete, so retrieval completeness cannot be claimed.",
      ),
      factor(
        "evidence_count",
        "Evidence count",
        evidencePoints,
        15,
        distinctEvidenceFiles,
        `${distinctEvidenceFiles} distinct returned source${distinctEvidenceFiles === 1 ? "" : "s"} contained exact cited evidence; full credit requires five.`,
      ),
      agreementKnown
        ? factor(
            "evidence_agreement",
            "Evidence agreement",
            agreementPoints,
            10,
            conflicts === 0 ? "no deterministic conflict detected" : conflicts,
            conflicts === 0
              ? "Multiple evidence sources had no recorded deterministic conflict signal. This does not prove factual agreement."
              : `${conflicts} unresolved deterministic conflict signal${conflicts === 1 ? "" : "s"} involved returned evidence.`,
          )
        : unknownFactor(
            "evidence_agreement",
            "Evidence agreement",
            10,
            distinctEvidenceFiles < 2
              ? "Fewer than two evidence sources were returned, so agreement cannot be measured."
              : "Conflict assessment was not available for this retrieval, so agreement was not scored.",
          ),
      freshnessHours === null || !Number.isFinite(freshnessHours)
        ? unknownFactor(
            "evidence_freshness",
            "Evidence freshness",
            10,
            "No successful synchronization timestamp was available.",
          )
        : factor(
            "evidence_freshness",
            "Evidence freshness",
            freshnessPoints,
            10,
            Math.round(freshnessHours),
            freshnessHours <= 24
              ? "The permission-scoped source inventory was synchronized within 24 hours."
              : `The last successful synchronization was ${Math.round(freshnessHours)} hours ago.`,
          ),
      factor(
        "structural_citation_quality",
        "Structural citation quality",
        structuralPoints,
        10,
        `${structuralCitations} of ${citations.length}`,
        `${structuralCitations} of ${citations.length} citations include an exact excerpt, evidence hash, and structural source location.`,
      ),
      input.conflictAssessmentComplete
        ? factor(
            "conflict_presence",
            "Conflict presence",
            conflictPoints,
            5,
            conflicts,
            conflicts
              ? `${conflicts} unresolved conflict signal${conflicts === 1 ? "" : "s"} reduced retrieval confidence; no source was silently chosen as correct.`
              : "No unresolved deterministic conflict signal was recorded for returned sources.",
          )
        : unknownFactor(
            "conflict_presence",
            "Conflict presence",
            5,
            "Conflict assessment did not complete, so absence of conflict cannot be claimed.",
          ),
      factor(
        "inaccessible_source_impact",
        "Inaccessible-source impact",
        accessibilityPoints,
        3,
        inaccessible,
        inaccessible
          ? `${inaccessible} known or discovered files were failed, pending, unsupported, or absent from the loaded inventory.`
          : "No known permission-scoped files were inaccessible, failed, pending, or unsupported.",
      ),
      factor(
        "retrieval_mode_limitations",
        "Retrieval-mode limitations",
        modePoints,
        2,
        "literal only",
        "This retrieval used deterministic literal matching only; semantic similarity was not evaluated.",
      ),
    ],
    rawScore = Math.max(
      0,
      Math.min(100, Math.round(factors.reduce((sum, item) => sum + item.points, 0))),
    ),
    evidenceCap =
      distinctEvidenceFiles === 0 ? 35 : distinctEvidenceFiles === 1 ? 65 : 100,
    permissionCap = permissionsComplete ? 100 : 49,
    conflictAssessmentCap = input.conflictAssessmentComplete ? 100 : 79,
    unresolvedConflictCap = conflicts > 0 ? 79 : 100,
    staleEvidenceCap = freshnessHours === null || freshnessHours > 720 ? 79 : 100,
    score = Math.min(
      rawScore,
      evidenceCap,
      permissionCap,
      conflictAssessmentCap,
      unresolvedConflictCap,
      staleEvidenceCap,
    ),
    supportingFactors = factors
      .filter((item) => item.status === "supporting")
      .map((item) => item.explanation),
    confidenceReductions = factors
      .filter((item) => item.status === "reducing")
      .map((item) => item.explanation)
      .concat(
        distinctEvidenceFiles === 0
          ? ["No exact evidence was returned, so the score is capped at 35."]
          : distinctEvidenceFiles === 1
            ? ["Only one evidence source was returned, so the score is capped at 65."]
            : [],
        permissionsComplete
          ? []
          : ["Permission completeness was not established, so the score is capped below Moderate."],
        input.conflictAssessmentComplete
          ? []
          : ["Conflict assessment was unavailable, so the score cannot be labeled High."],
        conflicts > 0
          ? ["Unresolved conflict signals prevent a High retrieval-confidence label."]
          : [],
        freshnessHours === null || freshnessHours > 720
          ? ["Missing or older-than-30-day synchronization prevents a High retrieval-confidence label."]
          : [],
      ),
    unknowns = factors
      .filter((item) => item.status === "unknown")
      .map((item) => item.explanation);
  return {
    score,
    label:
      score >= 80
        ? "High retrieval confidence"
        : score >= 50
          ? "Moderate retrieval confidence"
          : "Low retrieval confidence",
    scoringVersion: RETRIEVAL_CONFIDENCE_VERSION,
    configurationVersion: RETRIEVAL_CONFIDENCE_CONFIGURATION_VERSION,
    calculatedAt: now.toISOString(),
    factors,
    supportingFactors,
    confidenceReductions,
    limitations: [
      ...unknowns,
      "Retrieval confidence measures evidence coverage and retrieval quality, not whether an answer or source claim is factually true.",
      "Only configured connectors and known permission-scoped inventory are measurable; disconnected or unknown systems are not guessed.",
    ],
    disclosure:
      "Retrieval confidence measures the quality and completeness of the retrieved evidence. It is not the probability that an answer is correct.",
  };
}

function freshnessScore(hours: number | null) {
  if (hours === null || !Number.isFinite(hours)) return 0;
  if (hours <= 24) return 10;
  if (hours <= 168) return 6;
  if (hours <= 720) return 3;
  return 0;
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function points(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function factor(
  key: RetrievalConfidenceFactor["key"],
  label: string,
  awarded: number,
  maxPoints: number,
  measuredValue: number | string | boolean | null,
  explanation: string,
): RetrievalConfidenceFactor {
  const pointsAwarded = points(awarded);
  return {
    key,
    label,
    status: pointsAwarded >= maxPoints ? "supporting" : "reducing",
    points: pointsAwarded,
    maxPoints,
    measuredValue:
      typeof measuredValue === "boolean" ? String(measuredValue) : measuredValue,
    explanation,
  };
}

function unknownFactor(
  key: RetrievalConfidenceFactor["key"],
  label: string,
  maxPoints: number,
  explanation: string,
): RetrievalConfidenceFactor {
  return {
    key,
    label,
    status: "unknown",
    points: 0,
    maxPoints,
    measuredValue: null,
    explanation,
  };
}
