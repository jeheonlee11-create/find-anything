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
  units: Array<{
    id: string;
    unitType: string;
    text: string;
    structuralLocation: Record<string, unknown>;
    contentHash: string;
  }>;
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
  explanation: string[];
  snippet: string | null;
  score: number;
  citations: WorkspaceCitation[];
  scoreBreakdown: {
    title: number;
    filename: number;
    mimeType: number;
    content: number;
  };
  matchType: "literal";
  extractionMethod: string;
  source: "google_drive";
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
    filesSearched: number;
    indexedFiles: number;
    failedFiles: number;
    pendingFiles: number;
    unsupportedFiles: number;
    authorizedFilesDiscovered: number;
    paginationComplete: boolean;
    lastSuccessfulSyncAt: string | null;
    incompleteReasons: string[];
    complete: boolean;
  };
}
export const MATCHING_POLICY_VERSION = "literal-and-v3";

const MIME_BY_TYPE: Record<Exclude<WorkspaceFileType, "all">, string> = {
  docs: "application/vnd.google-apps.document",
  slides: "application/vnd.google-apps.presentation",
  sheets: "application/vnd.google-apps.spreadsheet",
  pdf: "application/pdf",
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let position = 0;
  while ((position = haystack.indexOf(needle, position)) !== -1) {
    count += 1;
    position += needle.length;
  }
  return count;
}

function shortestTermDistance(text: string, terms: string[]): number | null {
  if (terms.length < 2) return null;
  const positions = terms.map((term) => text.indexOf(term));
  return positions.some((position) => position < 0)
    ? null
    : Math.max(...positions) - Math.min(...positions);
}

function makeSnippet(text: string, terms: string[]): string | null {
  const normalized = text.toLocaleLowerCase();
  const indexes = terms
    .map((term) => normalized.indexOf(term))
    .filter((value) => value >= 0);
  if (!indexes.length) return null;
  const start = Math.max(0, Math.min(...indexes) - 80);
  const end = Math.min(text.length, start + 240);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}
function excerpt(text: string, terms: string[]): string {
  if (!text) return "";
  const lower = text.toLocaleLowerCase(),
    positions = terms
      .map((term) => lower.indexOf(term))
      .filter((position) => position >= 0),
    start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 80),
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
  };
}): WorkspaceSearchResponse {
  const query = input.query.trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
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
  const retrievedAt = new Date().toISOString();
  const candidateCounts = {
    keyword: 0,
    title: 0,
    mimeType: 0,
    content: 0,
    combined: 0,
  };
  const permissionDecisions = workspaceFiles.map((file) => ({
    fileId: file.id,
    decision: "allowed" as const,
    reason: "workspace membership and file workspace matched",
  }));
  const thresholdDecisions: Array<{
    fileId: string;
    decision: "included" | "excluded";
    reason: string;
  }> = [];
  const excludedResults: Array<{ fileId: string; reason: string }> = [];

  const matches = indexedEligible.flatMap((file) => {
    const normalizedName = normalize(file.name);
    const normalizedMime = normalize(file.mimeType);
    const content = file.units.map((unit) => unit.text).join("\n");
    const normalizedContent = normalize(content);
    const searchable = `${normalizedName}\n${normalizedMime}\n${normalizedContent}`;
    const titleHit =
        terms.length > 0 && terms.some((term) => normalizedName.includes(term)),
      mimeHit =
        terms.length > 0 && terms.some((term) => normalizedMime.includes(term)),
      contentHit =
        terms.length > 0 &&
        terms.some((term) => normalizedContent.includes(term));
    if (titleHit) candidateCounts.title += 1;
    if (mimeHit) candidateCounts.mimeType += 1;
    if (contentHit) candidateCounts.content += 1;
    if (titleHit || mimeHit || contentHit) candidateCounts.keyword += 1;
    const literalMatch =
      !terms.length || terms.every((term) => searchable.includes(term));
    if (!literalMatch) {
      thresholdDecisions.push({
        fileId: file.id,
        decision: "excluded",
        reason:
          "not every normalized query term matched indexed text or metadata",
      });
      excludedResults.push({ fileId: file.id, reason: "matching policy" });
      return [];
    }
    candidateCounts.combined += 1;
    thresholdDecisions.push({
      fileId: file.id,
      decision: "included",
      reason: "all normalized query terms matched",
    });

    const explanation: string[] = [];
    let score = 0;
    const scoreBreakdown = { title: 0, filename: 0, mimeType: 0, content: 0 };
    if (!terms.length) {
      explanation.push("indexed file");
    } else {
      const nameMatches = terms.filter((term) => normalizedName.includes(term));
      const mimeMatches = terms.filter((term) => normalizedMime.includes(term));
      const contentMatches = terms.filter((term) =>
        normalizedContent.includes(term),
      );
      if (nameMatches.length) {
        explanation.push("title match", "filename match");
        scoreBreakdown.title =
          normalizedName === normalize(query) ? 80 : 30 * nameMatches.length;
        scoreBreakdown.filename =
          normalizedName === normalize(query) ? 40 : 20 * nameMatches.length;
        score += scoreBreakdown.title + scoreBreakdown.filename;
      }
      const normalizedQuery = normalize(query),
        exactTitle = normalizedName === normalizedQuery,
        titlePhrase = normalizedQuery.length > 1 && normalizedName.includes(normalizedQuery),
        contentPhrase = normalizedQuery.length > 1 && normalizedContent.includes(normalizedQuery);
      if (exactTitle) {
        explanation.push("exact title match");
        scoreBreakdown.title += 120;
        score += 120;
      } else if (titlePhrase) {
        explanation.push("exact phrase in filename");
        scoreBreakdown.filename += 70;
        score += 70;
      }
      if (contentPhrase) {
        explanation.push("exact phrase in content");
        scoreBreakdown.content += 45;
        score += 45;
      }
      if (mimeMatches.length) {
        explanation.push("MIME-type match");
        scoreBreakdown.mimeType = 12 * mimeMatches.length;
        score += scoreBreakdown.mimeType;
      }
      if (contentMatches.length) {
        explanation.push("content match");
        scoreBreakdown.content = Math.min(
          40,
          terms.reduce(
            (total, term) => total + countOccurrences(normalizedContent, term),
            0,
          ) * 4,
        );
        score += scoreBreakdown.content;
        const distance = shortestTermDistance(normalizedContent, terms),
          proximityBonus = distance === null ? 0 : Math.max(0, 24 - Math.floor(distance / 20));
        if (proximityBonus) explanation.push("query terms appear close together");
        scoreBreakdown.content += proximityBonus;
        score += proximityBonus;
      }
      const ageDays = Math.max(0, Date.now() - Date.parse(file.modifiedAt)) / 86_400_000,
        recencyBonus = Number.isFinite(ageDays) ? Math.max(0, 12 - Math.floor(ageDays / 30)) : 0;
      if (recencyBonus) explanation.push("recently modified");
      score += recencyBonus;
    }
    const matchingUnits = file.units.filter(
        (unit) =>
          !terms.length ||
          terms.some((term) => normalize(unit.text).includes(term)),
      ),
      citationUnits = (
        matchingUnits.length ? matchingUnits : file.units.slice(0, 1)
      ).slice(0, 5);
    return [
      {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedAt: file.modifiedAt,
        sourceUrl: file.webViewLink,
        indexStatus: file.indexStatus,
        explanation: [...new Set(explanation)],
        snippet: makeSnippet(content, terms),
        score,
        scoreBreakdown,
        matchType: "literal" as const,
        extractionMethod: file.extractionMode ?? "unknown",
        source: "google_drive" as const,
        citations: citationUnits.map((unit) => ({
          fileId: file.id,
          sourceUrl: file.webViewLink,
          unitId: unit.id,
          unitType: unit.unitType,
          structuralLocation: unit.structuralLocation,
          excerpt: excerpt(unit.text, terms),
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
  const nextOffset = offset + results.length;
  const failedFiles = workspaceFiles.filter(
    (file) => file.indexStatus === "failed",
  ).length;
  const pendingFiles = workspaceFiles.filter(
    (file) => file.indexStatus === "pending",
  ).length;
  const unsupportedFiles = workspaceFiles.filter(
    (file) => file.indexStatus === "unsupported",
  ).length;
  const indexedFiles = workspaceFiles.filter(
    (file) => file.indexStatus === "indexed",
  ).length;
  const paginationComplete =
      input.permissionContext?.paginationComplete ?? true,
    incompleteReasons = [
      !paginationComplete
        ? "Drive authorization inventory pagination did not complete."
        : null,
      failedFiles ? `${failedFiles} files failed indexing.` : null,
      pendingFiles ? `${pendingFiles} files are pending indexing.` : null,
      unsupportedFiles
        ? `${unsupportedFiles} files were skipped because their format is unsupported.`
        : null,
    ].filter(Boolean) as string[];

  return {
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
      normalizedQuery: normalize(query),
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
          name: "Drive permission inventory",
          status: "executed",
          detail:
            "Only IDs returned by the currently connected Google account were eligible.",
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
    coverage: {
      totalKnownFiles: workspaceFiles.length,
      filesSearched: indexedEligible.length,
      indexedFiles,
      failedFiles,
      pendingFiles,
      unsupportedFiles,
      authorizedFilesDiscovered:
        input.permissionContext?.authorizedFilesDiscovered ??
        workspaceFiles.length,
      paginationComplete,
      lastSuccessfulSyncAt:
        input.permissionContext?.lastSuccessfulSyncAt ?? null,
      incompleteReasons,
      complete: incompleteReasons.length === 0,
    },
  };
}
