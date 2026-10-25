import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  calculateRetrievalConfidence,
  RETRIEVAL_CONFIDENCE_VERSION,
} from "../lib/workspace-search/confidence.ts";

const now = new Date("2026-07-17T12:00:00.000Z");
const coverage = {
  totalKnownFiles: 10,
  filesSearched: 10,
  indexedFiles: 10,
  failedFiles: 0,
  pendingFiles: 0,
  unsupportedFiles: 0,
  authorizedFilesDiscovered: 10,
  paginationComplete: true,
  lastSuccessfulSyncAt: "2026-07-17T00:00:00.000Z",
  incompleteReasons: [],
  complete: true,
};
function result(id) {
  return {
    id,
    name: `Evidence ${id}`,
    mimeType: "application/vnd.google-apps.document",
    modifiedAt: "2026-07-17T00:00:00.000Z",
    sourceUrl: `https://drive.google.com/${id}`,
    indexStatus: "indexed",
    explanation: ["content match"],
    snippet: "evidence",
    score: 10,
    scoreBreakdown: { title: 0, filename: 0, mimeType: 0, content: 10 },
    matchType: "literal",
    extractionMethod: "structured",
    source: "google_drive",
    citations: [
      {
        fileId: id,
        sourceUrl: `https://drive.google.com/${id}`,
        unitId: `unit_${id}`,
        unitType: "doc_paragraph",
        structuralLocation: { heading: "Decision", paragraphIndex: 2 },
        excerpt: "Exact supporting evidence",
        contentHash: `hash_${id}`,
        retrievedAt: now.toISOString(),
      },
    ],
  };
}
function calculate(overrides = {}) {
  return calculateRetrievalConfidence({
    coverage,
    results: [1, 2, 3, 4, 5].map((id) => result(String(id))),
    permissionDecisionCount: 10,
    connector: { searched: 1, expectedConfigured: 1 },
    unresolvedConflictCount: 0,
    conflictAssessmentComplete: true,
    retrievalMode: "literal",
    now,
    ...overrides,
  });
}

test("retrieval confidence is deterministic, versioned, and explainable", () => {
  const first = calculate(), second = calculate();
  assert.deepEqual(first, second);
  assert.equal(first.score, 98);
  assert.equal(first.label, "High retrieval confidence");
  assert.equal(first.scoringVersion, RETRIEVAL_CONFIDENCE_VERSION);
  assert.equal(first.factors.length, 10);
  assert.match(first.disclosure, /not the probability.*answer is correct/i);
});

test("zero and single-source evidence cannot produce misleading confidence", () => {
  const zero = calculate({ results: [] });
  assert.equal(zero.score, 35);
  assert.equal(zero.label, "Low retrieval confidence");
  assert.match(zero.confidenceReductions.join(" "), /No exact evidence/);
  const one = calculate({ results: [result("one")] });
  assert.ok(one.score <= 65);
  assert.notEqual(one.label, "High retrieval confidence");
});

test("partial permissions fail closed to a low confidence label", () => {
  const partial = calculate({
    coverage: { ...coverage, paginationComplete: false, complete: false },
    permissionDecisionCount: 9,
  });
  assert.ok(partial.score <= 49);
  assert.equal(partial.label, "Low retrieval confidence");
  assert.match(partial.confidenceReductions.join(" "), /Permission completeness/);
});

test("stale evidence and unresolved conflicts cannot be labeled High", () => {
  const stale = calculate({
    coverage: {
      ...coverage,
      lastSuccessfulSyncAt: "2026-05-01T00:00:00.000Z",
    },
  });
  assert.ok(stale.score <= 79);
  assert.equal(stale.label, "Moderate retrieval confidence");
  const conflicting = calculate({ unresolvedConflictCount: 2 });
  assert.ok(conflicting.score <= 79);
  assert.match(conflicting.confidenceReductions.join(" "), /conflict/i);
});

test("unknown agreement and conflicts are explicit rather than invented", () => {
  const unknown = calculate({ conflictAssessmentComplete: false, unresolvedConflictCount: null });
  assert.ok(unknown.score <= 79);
  assert.equal(
    unknown.factors.find((factor) => factor.key === "evidence_agreement")?.status,
    "unknown",
  );
  assert.match(unknown.limitations.join(" "), /not available|cannot be measured/i);
});

test("confidence is persisted in isolated traces and receipts and returned by REST", async () => {
  const [schema, audit, browserRoute, apiRoute, serialization, migration] =
    await Promise.all([
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/workspace-search/audit.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/workspaces/[workspaceId]/search/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/v1/search/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/workspace-search/serialization.ts", import.meta.url), "utf8"),
      readFile(new URL("../drizzle/0010_luxuriant_lyja.sql", import.meta.url), "utf8"),
    ]);
  for (const token of ["confidenceScore", "confidenceJson", "confidenceScoringVersion", "confidenceCalculatedAt"])
    assert.match(schema, new RegExp(token));
  assert.equal((audit.match(/confidenceJson:/g) ?? []).length, 2);
  assert.match(audit, /sourceRetrievalId:\s*searchId/);
  assert.match(audit, /actorIdentity:\s*input\.actor\.actorId/);
  assert.match(browserRoute, /actorWorkspace/);
  const pipeline = await readFile(new URL("../lib/workspace-search/run-search.ts", import.meta.url), "utf8");
  assert.match(browserRoute, /runWorkspaceSearch/);
  assert.match(pipeline, /conflictsForFiles/);
  assert.match(pipeline, /unresolvedConflictCount/);
  assert.match(apiRoute, /requireWorkspaceApiKey/);
  assert.match(apiRoute, /WORKSPACE_FORBIDDEN/);
  assert.match(serialization, /retrievalConfidence/);
  assert.equal((migration.match(/ADD `confidence_/g) ?? []).length, 10);
});
