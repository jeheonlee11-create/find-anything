export const RANKING_VERSION = "literal-ranking-v4";
export const RANKING_EXPLANATION_VERSION = "ranking-explanation-v1";
export type RankingFactorKey =
  | "exact_phrase"
  | "token_overlap"
  | "filename_match"
  | "title_match"
  | "heading_match"
  | "literal_occurrences"
  | "freshness"
  | "structural_citation_quality"
  | "authoritative_source"
  | "evidence_agreement"
  | "unresolved_conflict"
  | "retrieval_mode"
  | "semantic_similarity";
export type RankingFactor = {
  key: RankingFactorKey;
  contribution: number;
  active: boolean;
  measuredValue: string | number | null;
  explanation: string;
};
export type RankingBreakdown = {
  rankingVersion: string;
  explanationVersion: string;
  finalScore: number;
  position: number;
  factors: RankingFactor[];
  penalties: RankingFactor[];
  inactiveFactors: RankingFactor[];
  conciseExplanation: string;
  advancedRawBreakdown: Record<string, number>;
  rankedAboveNext: string | null;
};

export function calculateLiteralRanking(input: {
  exactTitle: boolean;
  titlePhrase: boolean;
  contentPhrase: boolean;
  titleTokenMatches: number;
  filenameTokenMatches: number;
  headingTokenMatches: number;
  occurrenceCount: number;
  freshnessDays: number | null;
  structuralCitation: boolean;
  authoritative: boolean;
  unresolvedConflict: boolean;
  conflictAssessmentComplete: boolean;
}): RankingBreakdown {
  const factors: RankingFactor[] = [
    factor(
      "exact_phrase",
      input.exactTitle ? 120 : input.titlePhrase ? 70 : input.contentPhrase ? 45 : 0,
      input.exactTitle || input.titlePhrase || input.contentPhrase,
      input.exactTitle
        ? "exact title"
        : input.titlePhrase
          ? "filename phrase"
          : input.contentPhrase
            ? "content phrase"
            : null,
      "Exact query phrase used directly by ranking.",
    ),
    factor(
      "token_overlap",
      Math.min(40, input.titleTokenMatches * 10),
      input.titleTokenMatches > 0,
      input.titleTokenMatches,
      "Normalized query tokens overlapping the title.",
    ),
    factor(
      "filename_match",
      Math.min(60, input.filenameTokenMatches * 20),
      input.filenameTokenMatches > 0,
      input.filenameTokenMatches,
      "Query tokens found in the stored filename.",
    ),
    factor(
      "title_match",
      Math.min(90, input.titleTokenMatches * 30),
      input.titleTokenMatches > 0,
      input.titleTokenMatches,
      "Query tokens found in the title field.",
    ),
    factor(
      "heading_match",
      Math.min(50, input.headingTokenMatches * 25),
      input.headingTokenMatches > 0,
      input.headingTokenMatches,
      "Query tokens matched a structured heading unit.",
    ),
    factor(
      "literal_occurrences",
      Math.min(40, input.occurrenceCount * 4),
      input.occurrenceCount > 0,
      input.occurrenceCount,
      "Literal occurrences in extracted content.",
    ),
    factor(
      "freshness",
      input.freshnessDays === null ? 0 : Math.max(0, 12 - Math.floor(input.freshnessDays / 30)),
      input.freshnessDays !== null,
      input.freshnessDays === null ? null : Math.round(input.freshnessDays),
      "Stored modified time contribution; freshness does not imply correctness.",
    ),
    factor(
      "structural_citation_quality",
      input.structuralCitation ? 8 : 0,
      input.structuralCitation,
      input.structuralCitation,
      "An exact citation has a hash and structural location.",
    ),
    factor(
      "authoritative_source",
      input.authoritative ? 20 : 0,
      input.authoritative,
      input.authoritative,
      "A user explicitly marked this source authoritative for a stored conflict.",
    ),
    factor(
      "evidence_agreement",
      input.conflictAssessmentComplete && !input.unresolvedConflict ? 5 : 0,
      input.conflictAssessmentComplete,
      input.conflictAssessmentComplete
        ? input.unresolvedConflict
          ? "unresolved conflict"
          : "no unresolved conflict"
        : null,
      input.conflictAssessmentComplete
        ? "No unresolved deterministic conflict involved this result."
        : "Conflict assessment was not available.",
    ),
    factor(
      "unresolved_conflict",
      input.unresolvedConflict ? -35 : 0,
      input.unresolvedConflict,
      input.unresolvedConflict,
      "Unresolved deterministic conflict penalty; no winner was selected.",
    ),
    factor("retrieval_mode", 0, true, "literal", "Literal retrieval is active; no semantic contribution is claimed."),
    factor(
      "semantic_similarity",
      0,
      false,
      null,
      "Semantic retrieval is disabled, so semantic similarity contributed nothing.",
    ),
  ];
  const finalScore = factors.reduce((sum, item) => sum + item.contribution, 0),
    active = factors
      .filter((item) => item.active && item.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution);
  return {
    rankingVersion: RANKING_VERSION,
    explanationVersion: RANKING_EXPLANATION_VERSION,
    finalScore,
    position: 0,
    factors,
    penalties: factors.filter((item) => item.contribution < 0),
    inactiveFactors: factors.filter((item) => !item.active),
    conciseExplanation: active.length
      ? active
          .slice(0, 3)
          .map((item) => item.key.replaceAll("_", " "))
          .join(" · ")
      : "Stable literal match",
    advancedRawBreakdown: Object.fromEntries(factors.map((item) => [item.key, item.contribution])),
    rankedAboveNext: null,
  };
}
function factor(
  key: RankingFactorKey,
  contribution: number,
  active: boolean,
  measuredValue: string | number | boolean | null,
  explanation: string,
): RankingFactor {
  return {
    key,
    contribution,
    active,
    measuredValue: typeof measuredValue === "boolean" ? String(measuredValue) : measuredValue,
    explanation,
  };
}
