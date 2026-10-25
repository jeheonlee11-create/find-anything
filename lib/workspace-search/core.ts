import {
  calculateRetrievalConfidence,
  type RetrievalConfidence,
} from "./confidence.ts";
import { buildCoverageSnapshot, summarizeCoverageInventory, type CoverageInventoryRow, type CoverageSnapshot } from "./coverage-map.ts";
import { calculateLiteralRanking, type RankingBreakdown } from "./ranking.ts";
import {
  collapseWhitespace,
  containsWord,
  countWords,
  firstWordPosition,
  normalizeText,
  queryTerms,
} from "./matching.ts";

export type WorkspaceFileType = "all" | "docs" | "slides" | "sheets" | "pdf";
export type WorkspaceSearchMode = "best" | "all";

export interface WorkspaceSearchFile {
  id: string;
  workspaceId: string;
  connectorId: string;
  sourceId: string;
  name: string;
  mimeType: string;
  modifiedAt: string;
  webViewLink: string | null;
  indexStatus: string;
  extractionError: string | null;
  extractionMode: string | null;
  structuralFallbackReason: string | null;
  /**
   * Extracted units. May be a subset of the file's stored units, as long as it
   * contains EVERY unit with at least one whole-word query term: the D1 search
   * path loads only those (plus the first unit, for a citation on title-only
   * matches) instead of the whole corpus.
   */
  units: Array<{
    id: string;
    unitType: string;
    text: string;
    structuralLocation: Record<string, unknown>;
    contentHash: string;
  }>;
}
/** A stored file's status, searchable or hidden; used only for coverage. */
export interface WorkspaceCoverageRow extends CoverageInventoryRow {
  id: string;
  workspaceId: string;
}
export interface WorkspaceCitation {
  fileId: string;
  sourceUrl: string | null;
  unitId: string;
  unitType: string;
  structuralLocation: Record<string, unknown>;
  excerpt: string;
  contentHash: string;
  retrievedAt: string;
}

export interface WorkspaceSearchResult {
  id: string;
  name: string;
  mimeType: string;
  modifiedAt: string;
  sourceUrl: string | null;
  indexStatus: string;
  /**
   * `content` — the file's extracted text was searched.
   * `name_only` — only its name/path/MIME were searched because its content
   * has not been extracted yet. Never carries a snippet or a citation, so a
   * name-only hit can never imply content was read.
   */
  matchScope: "content" | "name_only";
  explanation: string[];
  snippet: string | null;
  score: number;
  citations: WorkspaceCitation[];
  /** Always equals `ranking.finalScore`; `ranking.factors` itemizes it. */
  ranking: RankingBreakdown;
  matchType: "literal";
  extractionMethod: string;
  source: "google_drive" | "demo_fixture";
}

export interface WorkspaceSearchResponse {
  query: string;
  mode: WorkspaceSearchMode;
  fileType: WorkspaceFileType;
  results: WorkspaceSearchResult[];
  totalMatches: number;
  pageSize: number;
  showingFrom: number;
  showingTo: number;
  nextCursor: string | null;
  matchingPolicyVersion: string;
  diagnostics: {
    normalizedQuery: string;
    candidateCounts: {
      keyword: number;
      title: number;
      mimeType: number;
      content: number;
      combined: number;
    };
    duplicatesRemoved: number;
    permissionDecisions: Array<{
      fileId: string;
      decision: "allowed";
      reason: string;
    }>;
    thresholdDecisions: Array<{
      fileId: string;
      decision: "included" | "excluded";
      reason: string;
    }>;
    excludedResults: Array<{ fileId: string; reason: string }>;
    indexSnapshot: Array<{
      fileId: string;
      modifiedAt: string;
      unitHashes: string[];
    }>;
    stages: Array<{ name: string; status: "executed"; detail: string }>;
    finalResultOrder: string[];
  };
  coverage: {
    totalKnownFiles: number;
    /** Files whose extracted CONTENT was searched. */
    filesSearched: number;
    /** Files matched on name/path/MIME only, because content is not indexed. */
    nameOnlyFilesSearched: number;
    indexedFiles: number;
    /** Name-searchable rows whose content has never been extracted. */
    metadataOnlyFiles: number;
    failedFiles: number;
    pendingFiles: number;
    unsupportedFiles: number;
    authorizedFilesDiscovered: number;
    paginationComplete: boolean;
    lastSuccessfulSyncAt: string | null;
    incompleteReasons: string[];
    complete: boolean;
    snapshot: CoverageSnapshot;
  };
  confidence: RetrievalConfidence;
  conflicts: Array<{
    id: string; conflictType: string; detectionVersion: string; detectionMethod: string; leftFileId: string; rightFileId: string; leftValue: unknown; rightValue: unknown; leftCitation: WorkspaceCitation & { fileName?: string }; rightCitation: WorkspaceCitation & { fileName?: string }; newerFileId: string | null; relationshipInference: string; reasons: string[]; status: string; decision: unknown;
  }>;
}
/** v4: whole-word term matching (v3 matched substrings, so "cat" hit "category"). */
export const MATCHING_POLICY_VERSION = "literal-and-v4";

const MIME_BY_TYPE: Record<Exclude<WorkspaceFileType, "all">, string> = {
  docs: "application/vnd.google-apps.document",
  slides: "application/vnd.google-apps.presentation",
  sheets: "application/vnd.google-apps.spreadsheet",
  pdf: "application/pdf",
};

/**
 * An excerpt of up to 240 characters around the first whole-word occurrence
 * of any term. Returns null when no term occurs (or the text is empty).
 */
function excerptAround(text: string, terms: string[]): string | null {
  if (!text) return null;
  const position = firstWordPosition(text.toLocaleLowerCase(), terms);
  if (position < 0 && terms.length) return null;
  const start = Math.max(0, Math.max(0, position) - 80),
    end = Math.min(text.length, start + 240);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function encodeWorkspaceSearchCursor(offset: number): string {
  return btoa(String(Math.max(0, offset)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeWorkspaceSearchCursor(
  cursor: string | null | undefined,
): number {
  if (!cursor) return 0;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Number(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    );
    return Number.isSafeInteger(decoded) && decoded >= 0 ? decoded : 0;
  } catch {
    return 0;
  }
}

export function searchWorkspaceFiles(input: {
  workspaceId: string;
  files: WorkspaceSearchFile[];
  query: string;
  mode: WorkspaceSearchMode;
  fileType: WorkspaceFileType;
  cursor?: string | null;
  pageSize?: number;
  permissionContext?: {
    authorizedFilesDiscovered: number;
    paginationComplete: boolean;
    lastSuccessfulSyncAt: string | null;
    knownRemovedOrUnauthorized?: number;
  };
  /**
   * Every authorized stored file, including hidden failed/unsupported ones,
   * for coverage only. Omitted: coverage is derived from `files`.
   */
  coverageRows?: WorkspaceCoverageRow[];
  rankingContext?: { authoritativeFileIds?: Set<string>; unresolvedConflictFileIds?: Set<string>; conflictAssessmentComplete?: boolean };
}): WorkspaceSearchResponse {
  const query = input.query.trim();
  const terms = queryTerms(query);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = decodeWorkspaceSearchCursor(input.cursor);
  const workspaceFiles = input.files.filter(
    (file) => file.workspaceId === input.workspaceId,
  );
  const eligible = workspaceFiles.filter((file) =>
    input.fileType === "all"
      ? true
      : file.mimeType === MIME_BY_TYPE[input.fileType],
  );
  const indexedEligible = eligible.filter(
    (file) => file.indexStatus === "indexed",
  );
  // Stage 1 of the pipeline makes every discovered file name-searchable before
  // any extraction, which is what the dashboard's "Searchable by name (N)"
  // claim counts. Those rows are matched here on name/path/MIME ONLY — content
  // and phrase-in-content matching still require extracted text — so the claim
  // is true rather than cosmetic.
  const metadataEligible = eligible.filter(
    (file) => file.indexStatus === "metadata",
  );
  const searchableEligible = [...indexedEligible, ...metadataEligible];
  const retrievedAt = new Date().toISOString();
  const candidateCounts = {
    keyword: 0,
    title: 0,
    mimeType: 0,
    content: 0,
    combined: 0,
  };
  // Coverage counts the whole authorized inventory, hidden failed/unsupported
  // rows included. It never widens `workspaceFiles`, the only set searched.
  const coverageRows = new Map<string, CoverageInventoryRow>(
    workspaceFiles.map((file) => [file.id, { indexStatus: file.indexStatus, searchableStatus: "searchable", extractionMode: file.extractionMode }]),
  );
  const coverageOnlyIds: string[] = [];
  for (const row of input.coverageRows ?? [])
    if (row.workspaceId === input.workspaceId && !coverageRows.has(row.id)) {
      coverageRows.set(row.id, row);
      coverageOnlyIds.push(row.id);
    }
  const paginationComplete = input.permissionContext?.paginationComplete ?? true;
  const inventory = summarizeCoverageInventory([...coverageRows.values()], { paginationComplete });
  const permissionDecisions = [
    ...workspaceFiles.map((file) => ({
      fileId: file.id,
      decision: "allowed" as const,
      reason: "workspace membership and file workspace matched",
    })),
    ...coverageOnlyIds.map((fileId) => ({
      fileId,
      decision: "allowed" as const,
      reason: "authorized, but not searchable because its content was not indexed",
    })),
  ];
  const thresholdDecisions: Array<{
    fileId: string;
    decision: "included" | "excluded";
    reason: string;
  }> = [];
  const excludedResults: Array<{ fileId: string; reason: string }> = [];

  const phrase = collapseWhitespace(normalizeText(query));
  const matches = searchableEligible.flatMap((file) => {
    const nameOnly = file.indexStatus !== "indexed";
    const normalizedName = normalizeText(file.name);
    const normalizedMime = normalizeText(file.mimeType);
    // `units` may be a subset of the file's units, but always includes every
    // unit that contains at least one query term (see WorkspaceSearchFile).
    const units = nameOnly ? [] : file.units;
    const unitTexts = units.map((unit) => unit.text.toLocaleLowerCase());
    const termInName = terms.map((term) => containsWord(normalizedName, term));
    const termInMime = terms.map((term) => containsWord(normalizedMime, term));
    const termInContent = terms.map((term) => unitTexts.some((text) => containsWord(text, term)));
    const titleHit = termInName.some(Boolean),
      mimeHit = termInMime.some(Boolean),
      contentHit = termInContent.some(Boolean);
    if (titleHit) candidateCounts.title += 1;
    if (mimeHit) candidateCounts.mimeType += 1;
    if (contentHit) candidateCounts.content += 1;
    if (titleHit || mimeHit || contentHit) candidateCounts.keyword += 1;
    const literalMatch = terms.every((_, index) => termInName[index] || termInMime[index] || termInContent[index]);
    if (!literalMatch) {
      thresholdDecisions.push({
        fileId: file.id,
        decision: "excluded",
        reason: nameOnly
          ? "content is not indexed yet and not every query term matched the file name or type"
          : "not every query term matched indexed text or metadata as a whole word",
      });
      excludedResults.push({ fileId: file.id, reason: "matching policy" });
      return [];
    }
    // A name-only row with no query terms is not a claim of anything: an empty
    // query must not surface files whose content has never been read.
    if (nameOnly && !terms.length) {
      thresholdDecisions.push({
        fileId: file.id,
        decision: "excluded",
        reason: "content is not indexed yet and no query terms were supplied",
      });
      excludedResults.push({ fileId: file.id, reason: "matching policy" });
      return [];
    }
    candidateCounts.combined += 1;
    thresholdDecisions.push({
      fileId: file.id,
      decision: "included",
      reason: nameOnly
        ? "all query terms matched the file name or type as whole words; content is not indexed yet"
        : "all query terms matched as whole words",
    });

    const matchingUnits = units.filter(
        (_, index) => !terms.length || terms.some((term) => containsWord(unitTexts[index], term)),
      ),
      citationUnits = (matchingUnits.length ? matchingUnits : units.slice(0, 1)).slice(0, 5),
      exactTitle = phrase.length > 0 && collapseWhitespace(normalizedName) === phrase,
      titlePhrase = phrase.length > 1 && containsWord(collapseWhitespace(normalizedName), phrase),
      contentPhrase = phrase.length > 1 && unitTexts.some((text) => containsWord(collapseWhitespace(text), phrase)),
      titleTokenMatches = termInName.filter(Boolean).length,
      headingTokenMatches = terms.filter((term) =>
        units.some((unit, index) => /heading|title/i.test(unit.unitType) && containsWord(unitTexts[index], term)),
      ).length,
      occurrenceCount = terms.reduce(
        (total, term) => total + unitTexts.reduce((sum, text) => sum + countWords(text, term), 0),
        0,
      ),
      freshnessDays = Number.isFinite(Date.parse(file.modifiedAt)) ? Math.max(0, Date.now() - Date.parse(file.modifiedAt)) / 86_400_000 : null,
      structuralCitation = citationUnits.some((unit) => unit.contentHash && Object.keys(unit.structuralLocation).length > 0),
      // The ONLY score. Explanations below describe why the file matched;
      // every point in `score` is an itemized factor in `ranking`.
      ranking = calculateLiteralRanking({ exactTitle, titlePhrase, contentPhrase, titleTokenMatches, filenameTokenMatches: titleTokenMatches, headingTokenMatches, occurrenceCount, freshnessDays, structuralCitation, authoritative: input.rankingContext?.authoritativeFileIds?.has(file.id) ?? false, unresolvedConflict: input.rankingContext?.unresolvedConflictFileIds?.has(file.id) ?? false, conflictAssessmentComplete: input.rankingContext?.conflictAssessmentComplete ?? false });
    const explanation: string[] = [];
    if (nameOnly) explanation.push("name match (content not indexed yet)");
    if (!terms.length) explanation.push("indexed file");
    if (titleHit) explanation.push("title match", "filename match");
    if (exactTitle && terms.length) explanation.push("exact title match");
    else if (titlePhrase) explanation.push("exact phrase in filename");
    if (contentPhrase) explanation.push("exact phrase in content");
    if (mimeHit) explanation.push("MIME-type match");
    if (contentHit) explanation.push("content match");
    if (terms.length && ranking.factors.some((item) => item.key === "freshness" && item.contribution > 0))
      explanation.push("recently modified");
    const matchedText = matchingUnits.map((unit) => unit.text).join("\n");
    return [
      {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedAt: file.modifiedAt,
        sourceUrl: file.webViewLink,
        indexStatus: file.indexStatus,
        matchScope: (nameOnly ? "name_only" : "content") as
          | "content"
          | "name_only",
        explanation,
        // No content was read, so there is nothing honest to excerpt.
        snippet: nameOnly || !terms.length ? null : excerptAround(matchedText, terms),
        score: ranking.finalScore,
        ranking,
        matchType: "literal" as const,
        extractionMethod: file.extractionMode ?? "unknown",
        source: (input.workspaceId === "ws_yc_demo_acme" ? "demo_fixture" : "google_drive") as "google_drive" | "demo_fixture",
        citations: citationUnits.map((unit) => ({
          fileId: file.id,
          sourceUrl: file.webViewLink,
          unitId: unit.id,
          unitType: unit.unitType,
          structuralLocation: unit.structuralLocation,
          excerpt: excerptAround(unit.text, terms) ?? excerptAround(unit.text, []) ?? "",
          contentHash: unit.contentHash,
          retrievedAt,
        })),
      },
    ];
  });

  matches.sort(
    input.mode === "best"
      ? (left, right) =>
          right.score - left.score ||
          right.modifiedAt.localeCompare(left.modifiedAt) ||
          left.id.localeCompare(right.id)
      : (left, right) =>
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
  );

  const results = matches.slice(offset, offset + pageSize);
  results.forEach((result, index) => {
    result.ranking.position = offset + index + 1;
    const next = matches[offset + index + 1];
    result.ranking.rankedAboveNext = input.mode === "all"
      ? "Find All uses exhaustive filename and stable file-ID order; score does not affect position."
      : next
      ? result.score !== next.score
        ? `Ranked above the next result by ${result.score - next.score} scoring points.`
        : result.modifiedAt !== next.modifiedAt
          ? "Equal score; ranked above the next result by newer stored modified time."
          : "Equal score and modified time; ranked by stable file ID."
      : null;
  });
  const nextOffset = offset + results.length;
  const coverage: WorkspaceSearchResponse["coverage"] = {
    totalKnownFiles: inventory.knownInventoryRows,
    filesSearched: indexedEligible.length,
    nameOnlyFilesSearched: metadataEligible.length,
    indexedFiles: inventory.indexed,
    metadataOnlyFiles: inventory.metadataOnly,
    failedFiles: inventory.failed,
    pendingFiles: inventory.pending,
    unsupportedFiles: inventory.unsupported,
    authorizedFilesDiscovered:
      input.permissionContext?.authorizedFilesDiscovered ??
      inventory.knownInventoryRows,
    paginationComplete,
    lastSuccessfulSyncAt:
      input.permissionContext?.lastSuccessfulSyncAt ?? null,
    incompleteReasons: inventory.incompleteReasons,
    complete: inventory.complete,
    snapshot: buildCoverageSnapshot({
      authorization: "authorized",
      authorizedDiscovered: input.permissionContext?.authorizedFilesDiscovered ?? inventory.knownInventoryRows,
      knownInventoryRows: inventory.knownInventoryRows,
      indexed: inventory.indexed,
      searchable: inventory.searchable,
      failed: inventory.failed,
      pending: inventory.pending,
      unsupported: inventory.unsupported,
      knownRemovedOrUnauthorized: input.permissionContext?.knownRemovedOrUnauthorized ?? 0,
      paginationComplete,
      lastSuccessfulSyncAt: input.permissionContext?.lastSuccessfulSyncAt ?? null,
      observedAt: retrievedAt,
    }),
  };
  const response: WorkspaceSearchResponse = {
    query,
    mode: input.mode,
    fileType: input.fileType,
    results,
    totalMatches: matches.length,
    pageSize,
    showingFrom: results.length ? offset + 1 : 0,
    showingTo: results.length ? offset + results.length : 0,
    nextCursor:
      nextOffset < matches.length
        ? encodeWorkspaceSearchCursor(nextOffset)
        : null,
    matchingPolicyVersion: MATCHING_POLICY_VERSION,
    diagnostics: {
      normalizedQuery: normalizeText(query),
      candidateCounts,
      duplicatesRemoved: 0,
      permissionDecisions,
      thresholdDecisions,
      excludedResults,
      indexSnapshot: workspaceFiles
        .map((file) => ({
          fileId: file.id,
          modifiedAt: file.modifiedAt,
          unitHashes: file.units.map((unit) => unit.contentHash),
        }))
        .sort((a, b) => a.fileId.localeCompare(b.fileId)),
      stages: [
        {
          name: "Workspace authorization",
          status: "executed",
          detail:
            "Authenticated membership was required before connector data was loaded.",
        },
        {
          name: input.workspaceId === "ws_yc_demo_acme" ? "Permission-scoped fixture inventory" : "Drive permission inventory",
          status: "executed",
          detail:
            input.workspaceId === "ws_yc_demo_acme" ? "Only records assigned to the authorized synthetic demo workspace were eligible." : "Only IDs returned by the currently connected Google account were eligible.",
        },
        {
          name: "Literal retrieval",
          status: "executed",
          detail:
            "Title, filename, MIME type, and extracted content were matched.",
        },
        {
          name: "Stable ranking",
          status: "executed",
          detail:
            input.mode === "best"
              ? "Literal score, modified time, then file ID."
              : "Filename, then file ID.",
        },
      ],
      finalResultOrder: results.map((result) => result.id),
    },
    coverage,
    confidence: null as unknown as RetrievalConfidence,
    conflicts: [],
  };
  response.confidence = calculateRetrievalConfidence({
    coverage,
    results,
    permissionDecisionCount: permissionDecisions.length,
    connector: { searched: 1, expectedConfigured: 1 },
    unresolvedConflictCount: null,
    conflictAssessmentComplete: false,
    retrievalMode: "literal",
  });
  return response;
}
