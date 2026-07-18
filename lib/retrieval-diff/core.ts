export const RETRIEVAL_DIFF_VERSION = "retrieval-diff-v1";

export type RetrievalComparability = "exact" | "comparable" | "manual" | "not_comparable";
export type RetrievalDiffSeverity = "info" | "low" | "medium" | "high";
export type RetrievalDiffItem = {
  changeType: string;
  before: unknown;
  after: unknown;
  affectedSource: { fileId: string; name: string } | { status: "unavailable" } | null;
  affectedStage: string | null;
  references: Array<{ kind: "trace" | "citation"; id: string }>;
  severity: RetrievalDiffSeverity;
  explanation: string;
  relationship: "observed" | "inferred";
};

type Trace = Record<string, unknown> & {
  traceId?: string;
  normalizedQuery?: string;
  searchMode?: string;
  filters?: Record<string, unknown>;
  results?: Array<Record<string, unknown>>;
  rankingExplanations?: Array<Record<string, unknown>> | null;
  coverage?: Record<string, unknown>;
  coverageSnapshot?: Record<string, unknown> | null;
  conflicts?: Array<Record<string, unknown>>;
  retrievalConfidence?: Record<string, unknown> | null;
  replay?: { schemaVersion?: string | null; events?: Array<Record<string, unknown>> } | null;
};

export type RetrievalDiff = {
  version: typeof RETRIEVAL_DIFF_VERSION;
  beforeTraceId: string;
  afterTraceId: string;
  comparability: {
    category: RetrievalComparability;
    reasons: string[];
    normalizedTokenOverlap: number;
    sameScope: boolean;
    sameMode: boolean;
  };
  items: RetrievalDiffItem[];
  summary: { totalChanges: number; bySeverity: Record<RetrievalDiffSeverity, number>; unavailableSources: number };
  disclosure: string;
};

export function comparePersistedRetrievals(input: {
  before: Trace;
  after: Trace;
  currentlyAuthorizedFileIds: Set<string>;
  manual?: boolean;
}): RetrievalDiff {
  const beforeId = String(input.before.traceId ?? ""), afterId = String(input.after.traceId ?? "");
  const comparable = comparability(input.before, input.after, Boolean(input.manual));
  const items: RetrievalDiffItem[] = [];
  const beforeResults = resultMap(input.before), afterResults = resultMap(input.after);
  const allResultIds = [...new Set([...beforeResults.keys(), ...afterResults.keys()])].sort();
  for (const fileId of allResultIds) {
    const before = beforeResults.get(fileId), after = afterResults.get(fileId), authorized = input.currentlyAuthorizedFileIds.has(fileId);
    if (!before && after) items.push(item("result_added", null, authorized ? resultSummary(after) : "unavailable", source(after, authorized), null, refs(beforeId, afterId), "medium", "A result appears in the later persisted execution.", "observed"));
    if (before && !after) items.push(item("result_removed", authorized ? resultSummary(before) : "unavailable", null, source(before, authorized), null, refs(beforeId, afterId), "medium", "A result no longer appears; the diff does not claim why it changed.", "observed"));
    if (!before || !after) continue;
    if (!authorized) {
      if (JSON.stringify(resultSummary(before)) !== JSON.stringify(resultSummary(after))) items.push(item("prior_evidence_unavailable", "unavailable", "unavailable", { status: "unavailable" }, null, refs(beforeId, afterId), "high", "The prior source is not currently authorized, so source details and citations are redacted.", "observed"));
      continue;
    }
    const beforeRank = ranking(input.before, fileId), afterRank = ranking(input.after, fileId);
    if (number(beforeRank?.position) !== number(afterRank?.position)) items.push(item("ranking_position_changed", number(beforeRank?.position), number(afterRank?.position), source(after, true), null, refs(beforeId, afterId), "low", "The stored result position changed; no cause is inferred.", "observed"));
    if (number(beforeRank?.finalScore) !== number(afterRank?.finalScore)) items.push(item("ranking_score_changed", number(beforeRank?.finalScore), number(afterRank?.finalScore), source(after, true), null, refs(beforeId, afterId), "low", "The persisted ranking score changed between executions.", "observed"));
    const beforeCitations = citationKeys(before), afterCitations = citationKeys(after);
    for (const key of beforeCitations.filter((value) => !afterCitations.includes(value))) items.push(item("evidence_removed", { citation: key }, null, source(before, true), null, [...refs(beforeId, afterId), { kind: "citation", id: key }], "medium", "Stored cited evidence was removed from the result.", "observed"));
    for (const key of afterCitations.filter((value) => !beforeCitations.includes(value))) items.push(item("evidence_added", null, { citation: key }, source(after, true), null, [...refs(beforeId, afterId), { kind: "citation", id: key }], "medium", "Stored cited evidence was added to the result.", "observed"));
    if (beforeCitations.length === afterCitations.length && beforeCitations.join("|") !== afterCitations.join("|")) items.push(item("citation_changed", beforeCitations.length, afterCitations.length, source(after, true), null, refs(beforeId, afterId), "medium", "Citation identity or structural evidence changed.", "observed"));
  }
  compareFields(items, input.before.coverage ?? {}, input.after.coverage ?? {}, ["totalKnownFiles", "filesSearched", "indexedFiles", "failedFiles", "pendingFiles", "paginationComplete"], "coverage_changed", beforeId, afterId, "medium");
  compareFields(items, input.before.coverage ?? {}, input.after.coverage ?? {}, ["authorizedFilesDiscovered"], "permission_accessibility_changed", beforeId, afterId, "high");
  compareFields(items, input.before.coverage ?? {}, input.after.coverage ?? {}, ["lastSuccessfulSyncAt"], "synchronization_freshness_changed", beforeId, afterId, "low");
  compareConflicts(items, input.before, input.after, input.currentlyAuthorizedFileIds, beforeId, afterId);
  compareConfidence(items, input.before, input.after, beforeId, afterId);
  if (input.before.searchMode !== input.after.searchMode) items.push(item("retrieval_mode_changed", input.before.searchMode ?? null, input.after.searchMode ?? null, null, null, refs(beforeId, afterId), "medium", "The stored retrieval mode changed.", "observed"));
  compareReplay(items, input.before, input.after, beforeId, afterId);
  items.sort(diffOrder);
  const bySeverity: Record<RetrievalDiffSeverity, number> = { info: 0, low: 0, medium: 0, high: 0 };
  for (const change of items) bySeverity[change.severity] += 1;
  return {
    version: RETRIEVAL_DIFF_VERSION,
    beforeTraceId: beforeId,
    afterTraceId: afterId,
    comparability: comparable,
    items,
    summary: { totalChanges: items.length, bySeverity, unavailableSources: items.filter((change) => change.affectedSource && "status" in change.affectedSource).length },
    disclosure: "This diff reports observed persisted differences. It does not claim that one change caused another unless a persisted artifact explicitly records that relationship.",
  };
}

function comparability(before: Trace, after: Trace, manual: boolean) {
  const left = normalize(String(before.normalizedQuery ?? "")), right = normalize(String(after.normalizedQuery ?? ""));
  const leftTokens = new Set(left.split(" ").filter(Boolean)), rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length, union = new Set([...leftTokens, ...rightTokens]).size;
  const overlap = union ? intersection / union : left === right ? 1 : 0;
  const sameMode = before.searchMode === after.searchMode, sameScope = stable(scope(before.filters)) === stable(scope(after.filters));
  let category: RetrievalComparability;
  if (left === right && sameMode && sameScope) category = "exact";
  else if (overlap >= 0.6 && sameMode && sameScope) category = "comparable";
  else if (manual) category = "manual";
  else category = "not_comparable";
  return { category, reasons: [left === right ? "NORMALIZED_QUERY_MATCH" : overlap >= 0.6 ? "SUBSTANTIAL_TOKEN_OVERLAP" : "QUERY_SCOPE_DIFFERS", sameMode ? "RETRIEVAL_MODE_MATCH" : "RETRIEVAL_MODE_DIFFERS", sameScope ? "FILTER_SCOPE_MATCH" : "FILTER_SCOPE_DIFFERS", ...(manual && category === "manual" ? ["EXPLICIT_MANUAL_SELECTION"] : [])], normalizedTokenOverlap: Number(overlap.toFixed(3)), sameScope, sameMode };
}
function scope(filters: Record<string, unknown> | undefined) { return { fileType: filters?.fileType ?? "all" }; }
function resultMap(trace: Trace) { return new Map((trace.results ?? []).map((value) => [String(value.id), value])); }
function ranking(trace: Trace, fileId: string) { return (trace.rankingExplanations ?? []).find((value) => String(value.fileId) === fileId); }
function resultSummary(value: Record<string, unknown>) { return { id: value.id, name: value.name, mimeType: value.mimeType, score: value.score }; }
function source(value: Record<string, unknown>, authorized: boolean): RetrievalDiffItem["affectedSource"] { return authorized ? { fileId: String(value.id), name: String(value.name ?? "Authorized source") } : { status: "unavailable" }; }
function citationKeys(value: Record<string, unknown>) { return (Array.isArray(value.citations) ? value.citations : []).map((citation) => { const row = citation as Record<string, unknown>; return `${String(row.contentHash ?? "")}:${stable(row.structuralLocation ?? {})}`; }).sort(); }
function refs(before: string, after: string): RetrievalDiffItem["references"] { return [{ kind: "trace", id: before }, { kind: "trace", id: after }]; }
function item(changeType: string, before: unknown, after: unknown, affectedSource: RetrievalDiffItem["affectedSource"], affectedStage: string | null, references: RetrievalDiffItem["references"], severity: RetrievalDiffSeverity, explanation: string, relationship: "observed" | "inferred"): RetrievalDiffItem { return { changeType, before, after, affectedSource, affectedStage, references, severity, explanation, relationship }; }
function compareFields(items: RetrievalDiffItem[], before: Record<string, unknown>, after: Record<string, unknown>, fields: string[], type: string, beforeId: string, afterId: string, severity: RetrievalDiffSeverity) { for (const field of fields) if (stable(before[field]) !== stable(after[field])) items.push(item(type, { field, value: before[field] ?? null }, { field, value: after[field] ?? null }, null, null, refs(beforeId, afterId), severity, `Observed ${field} changed in the persisted snapshot.`, "observed")); }
function compareConflicts(items: RetrievalDiffItem[], before: Trace, after: Trace, authorized: Set<string>, beforeId: string, afterId: string) {
  const left = new Map((before.conflicts ?? []).map((value) => [String(value.id), value])), right = new Map((after.conflicts ?? []).map((value) => [String(value.id), value]));
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) { const a = left.get(id), b = right.get(id), ids = [a?.leftFileId, a?.rightFileId, b?.leftFileId, b?.rightFileId].filter(Boolean).map(String), visible = ids.every((fileId) => authorized.has(fileId)); if (!visible) { if (!a || !b || a.status !== b.status || stable(a.decision) !== stable(b.decision)) items.push(item("conflict_changed", "unavailable", "unavailable", { status: "unavailable" }, "conflict_lookup", refs(beforeId, afterId), "high", "A conflict changed, but its source is no longer authorized.", "observed")); continue; } if (!a && b) items.push(item("conflict_appeared", null, { id, status: b.status }, null, "conflict_lookup", refs(beforeId, afterId), "high", "A persisted conflict appeared.", "observed")); else if (a && !b) items.push(item("conflict_disappeared", { id, status: a.status }, null, null, "conflict_lookup", refs(beforeId, afterId), "medium", "A persisted conflict disappeared; no resolution cause is inferred.", "observed")); else if (a?.status !== b?.status) items.push(item(b?.status === "resolved" ? "conflict_resolved" : "conflict_status_changed", { id, status: a?.status }, { id, status: b?.status }, null, "conflict_lookup", refs(beforeId, afterId), "high", "The persisted conflict status changed.", "observed")); const authorityBefore = a?.status === "authoritative_source", authorityAfter = b?.status === "authoritative_source"; if (authorityBefore !== authorityAfter || (authorityBefore && authorityAfter && stable(a?.decision) !== stable(b?.decision))) items.push(item("authoritative_source_decision_changed", authorityBefore ? a?.decision ?? true : false, authorityAfter ? b?.decision ?? true : false, null, "conflict_lookup", refs(beforeId, afterId), "medium", "An explicit authoritative-source decision changed.", "observed")); }
}
function compareConfidence(items: RetrievalDiffItem[], before: Trace, after: Trace, beforeId: string, afterId: string) { const a = before.retrievalConfidence, b = after.retrievalConfidence; if (!a || !b) { if (Boolean(a) !== Boolean(b)) items.push(item("confidence_snapshot_availability_changed", Boolean(a), Boolean(b), null, null, refs(beforeId, afterId), "info", "One persisted execution lacks a confidence snapshot.", "observed")); return; } if (a.score !== b.score || a.label !== b.label) items.push(item("confidence_changed", { score: a.score, label: a.label }, { score: b.score, label: b.label }, null, null, refs(beforeId, afterId), "medium", "The persisted confidence score or label changed.", "observed")); }
function compareReplay(items: RetrievalDiffItem[], before: Trace, after: Trace, beforeId: string, afterId: string) { const a = new Map((before.replay?.events ?? []).map((event) => [String(event.stage), event])), b = new Map((after.replay?.events ?? []).map((event) => [String(event.stage), event])); if (!before.replay || !after.replay) { if (Boolean(before.replay) !== Boolean(after.replay)) items.push(item("trace_replay_availability_changed", Boolean(before.replay), Boolean(after.replay), null, null, refs(beforeId, afterId), "info", "One legacy trace has no replay snapshot.", "observed")); return; } for (const stage of [...new Set([...a.keys(), ...b.keys()])].sort()) { const left = a.get(stage), right = b.get(stage); const prior = left ? { status: left.status, inputCount: left.inputCount, outputCount: left.outputCount, excludedCount: left.excludedCount, warningCount: left.warningCount } : null, next = right ? { status: right.status, inputCount: right.inputCount, outputCount: right.outputCount, excludedCount: right.excludedCount, warningCount: right.warningCount } : null; if (stable(prior) !== stable(next)) items.push(item("trace_stage_changed", prior, next, null, stage, refs(beforeId, afterId), "low", "A persisted trace-stage status or count changed.", "observed")); } }
function number(value: unknown) { return typeof value === "number" ? value : null; }
function normalize(value: string) { return value.trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function stable(value: unknown): string { if (value === undefined) return "undefined"; if (!value || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; }
const severityOrder: Record<RetrievalDiffSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
function diffOrder(a: RetrievalDiffItem, b: RetrievalDiffItem) { return severityOrder[a.severity] - severityOrder[b.severity] || a.changeType.localeCompare(b.changeType) || stable(a.affectedSource).localeCompare(stable(b.affectedSource)) || stable(a.before).localeCompare(stable(b.before)); }
