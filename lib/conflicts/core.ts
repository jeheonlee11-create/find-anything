export const CONFLICT_DETECTION_VERSION = "deterministic-conflicts-v1";
export const CONFLICT_CANDIDATE_WINDOW = 4;
export type ConflictType = "currency_amount" | "date" | "approval_status" | "version_label" | "draft_vs_final" | "duplicate_filename_content" | "newer_contradicts_older";
export type ConflictCitation = { fileId: string; fileName: string; unitId: string; unitType: string; structuralLocation: Record<string, unknown>; excerpt: string; contentHash: string; sourceUrl: string | null };
export type DetectedConflict = { conflictType: ConflictType; detectionMethod: string; leftFileId: string; rightFileId: string; leftValue: string; rightValue: string; leftCitation: ConflictCitation; rightCitation: ConflictCitation; newerFileId: string | null; relationshipInference: string; reasons: string[] };
type File = { id: string; name: string; modifiedAt: string; webViewLink: string | null; units: Array<{ id: string; unitType: string; text: string; structuralLocation: Record<string, unknown>; contentHash: string }> };
type Candidate = { type: Exclude<ConflictType, "duplicate_filename_content" | "newer_contradicts_older">; value: string; citation: ConflictCitation };

export function detectDeterministicConflicts(files: File[]): DetectedConflict[] {
  return detectDeterministicConflictsWithMetrics(files).conflicts;
}
export function detectDeterministicConflictsWithMetrics(files: File[]) {
  const candidateStarted = performance.now(), pairs = candidatePairs(files), candidateGenerationMs = performance.now() - candidateStarted, comparisonStarted = performance.now(), output: DetectedConflict[] = [], facts = new Map<string, Candidate[]>();
  for (const [left, right] of pairs) {
    const newerFileId = Date.parse(left.modifiedAt) === Date.parse(right.modifiedAt) ? null : Date.parse(left.modifiedAt) > Date.parse(right.modifiedAt) ? left.id : right.id;
    const leftCandidates = facts.get(left.id) ?? candidates(left), rightCandidates = facts.get(right.id) ?? candidates(right);
    facts.set(left.id, leftCandidates); facts.set(right.id, rightCandidates);
    for (const type of ["currency_amount", "date", "approval_status", "version_label"] as const) {
      const a = leftCandidates.find((item) => item.type === type), b = rightCandidates.find((item) => item.type === type);
      if (a && b && a.value !== b.value) output.push(conflict(type, `regex:${type}:v1`, left, right, a, b, newerFileId, [`Related filenames contain different normalized ${type.replaceAll("_", " ")} values.`]));
    }
    const leftDraft = stateCandidate(left, leftCandidates), rightDraft = stateCandidate(right, rightCandidates);
    if (leftDraft && rightDraft && leftDraft.value !== rightDraft.value)
      output.push(conflict("draft_vs_final", "filename-and-content-state:v1", left, right, leftDraft, rightDraft, newerFileId, ["One related source is marked draft and the other final; neither is silently selected."]));
    const sameName = normalizeName(left.name) === normalizeName(right.name), leftHash = left.units.map((unit) => unit.contentHash).join("|"), rightHash = right.units.map((unit) => unit.contentHash).join("|");
    if (sameName && leftHash && rightHash && leftHash !== rightHash) {
      const a = citationCandidate(left, "different-content-hash"), b = citationCandidate(right, "different-content-hash");
      output.push(conflict("duplicate_filename_content", "normalized-filename-plus-content-hash:v1", left, right, a, b, newerFileId, ["Identical normalized filenames have different extracted-content hashes."]));
    }
    const contradictory = output.filter((item) => item.leftFileId === left.id && item.rightFileId === right.id && !["duplicate_filename_content", "newer_contradicts_older"].includes(item.conflictType));
    if (newerFileId && contradictory.length) {
      const first = contradictory[0];
      output.push({ ...first, conflictType: "newer_contradicts_older", detectionMethod: "modified-time-plus-detected-value-conflict:v1", relationshipInference: `File ${newerFileId} is newer by stored modified time; newer does not mean authoritative.`, reasons: ["A newer related file contains a deterministically different detected value."] });
    }
  }
  return { conflicts: unique(output), metrics: { files: files.length, candidatePairs: pairs.length, candidateGenerationMs: rounded(candidateGenerationMs), extractionAndComparisonMs: rounded(performance.now() - comparisonStarted), boundedWindow: CONFLICT_CANDIDATE_WINDOW } };
}

function candidatePairs(files: File[]): Array<[File, File]> {
  const buckets = new Map<string, File[]>();
  for (const file of files) { const key = normalizeName(file.name).split(" ").slice(0, 3).join(" "); if (!key) continue; const group = buckets.get(key) ?? []; group.push(file); buckets.set(key, group); }
  const pairs: Array<[File, File]> = [];
  for (const group of buckets.values()) { group.sort((a,b) => a.modifiedAt.localeCompare(b.modifiedAt) || a.id.localeCompare(b.id)); for (let right = 1; right < group.length; right++) for (let left = Math.max(0, right - CONFLICT_CANDIDATE_WINDOW); left < right; left++) if (relatedNames(group[left].name, group[right].name)) pairs.push([group[left], group[right]]); }
  return pairs;
}

function candidates(file: File): Candidate[] {
  const output: Candidate[] = [];
  for (const unit of file.units) {
    const specs: Array<[Candidate["type"], RegExp]> = [
      ["currency_amount", /(?:\$|USD\s*)\d[\d,]*(?:\.\d{2})?/i],
      ["date", /\b(?:20\d{2}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+20\d{2})\b/i],
      ["approval_status", /\b(?:not approved|pending approval|approved|rejected)\b/i],
      ["version_label", /\b(?:version|v)\s*\d+(?:\.\d+)*\b/i],
    ];
    for (const [type, regex] of specs) { const match = unit.text.match(regex); if (match && !output.some((item) => item.type === type)) output.push({ type, value: normalizeValue(type, match[0]), citation: citation(file, unit, match.index ?? 0) }); }
  }
  return output;
}
function stateCandidate(file: File, found: Candidate[]): Candidate | null { const value = /\bfinal\b/i.test(file.name) ? "final" : /\bdraft\b/i.test(file.name) ? "draft" : null; return value ? { type: "version_label", value, citation: found[0]?.citation ?? citationCandidate(file, value).citation } : null; }
function citationCandidate(file: File, value: string): Candidate { const unit = file.units[0]; return { type: "version_label", value, citation: unit ? citation(file, unit, 0) : { fileId: file.id, fileName: file.name, unitId: "metadata", unitType: "filename", structuralLocation: { field: "name" }, excerpt: file.name, contentHash: "metadata", sourceUrl: file.webViewLink } }; }
function citation(file: File, unit: File["units"][number], index: number): ConflictCitation { return { fileId: file.id, fileName: file.name, unitId: unit.id, unitType: unit.unitType, structuralLocation: unit.structuralLocation, excerpt: unit.text.slice(Math.max(0, index - 60), index + 180).replace(/\s+/g, " "), contentHash: unit.contentHash, sourceUrl: file.webViewLink }; }
function conflict(type: ConflictType, method: string, left: File, right: File, a: Candidate, b: Candidate, newerFileId: string | null, reasons: string[]): DetectedConflict { return { conflictType: type, detectionMethod: method, leftFileId: left.id, rightFileId: right.id, leftValue: a.value, rightValue: b.value, leftCitation: a.citation, rightCitation: b.citation, newerFileId, relationshipInference: newerFileId ? `Stored modified time identifies ${newerFileId} as newer; authority is not inferred.` : "No newer source was inferred.", reasons }; }
function normalizeName(value: string) { return value.toLocaleLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/\b(?:draft|final|approved|copy|v(?:ersion)?\s*\d+(?:\.\d+)*)\b/gi, " ").replace(/[^a-z0-9]+/g, " ").trim(); }
function relatedNames(a: string, b: string) { const left = new Set(normalizeName(a).split(" ").filter(Boolean)), right = new Set(normalizeName(b).split(" ").filter(Boolean)); if (!left.size || !right.size) return normalizeName(a) === normalizeName(b); const common = [...left].filter((token) => right.has(token)).length; return common / new Set([...left, ...right]).size >= .5; }
function normalizeValue(type: Candidate["type"], value: string) { const normalized = value.trim().toLocaleLowerCase(); if (type === "currency_amount") return normalized.replace(/usd\s*/i, "$").replace(/,/g, ""); return normalized.replace(/\s+/g, " "); }
function unique(items: DetectedConflict[]) { const seen = new Set<string>(); return items.filter((item) => { const key = `${item.leftFileId}:${item.rightFileId}:${item.conflictType}:${item.leftValue}:${item.rightValue}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function rounded(value: number) { return Number(value.toFixed(3)); }
