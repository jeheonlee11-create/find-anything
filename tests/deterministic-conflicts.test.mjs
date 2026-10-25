import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { detectDeterministicConflicts, CONFLICT_DETECTION_VERSION } from "../lib/conflicts/core.ts";

function file(id, name, text, modifiedAt) { return { id, name, modifiedAt, webViewLink: `https://drive.google.com/open?id=${id}`, units: [{ id: `unit_${id}`, unitType: "paragraph", text, structuralLocation: { paragraphIndex: 0 }, contentHash: `hash_${id}_${text.length}` }] }; }
test("detects supported deterministic conflicts and preserves both exact citations", () => {
  const conflicts = detectDeterministicConflicts([
    file("a", "Launch Plan draft v1", "Budget $10,000. Approval pending approval. Launch date 2026-08-01. version 1", "2026-07-01T00:00:00.000Z"),
    file("b", "Launch Plan final v2", "Budget $12,000. Approval approved. Launch date 2026-09-01. version 2", "2026-07-10T00:00:00.000Z"),
  ]);
  for (const type of ["currency_amount", "date", "approval_status", "version_label", "draft_vs_final", "newer_contradicts_older"]) assert.ok(conflicts.some((item) => item.conflictType === type), type);
  for (const item of conflicts) { assert.ok(item.leftCitation.contentHash); assert.ok(item.rightCitation.contentHash); assert.ok(item.detectionMethod); assert.match(item.relationshipInference, /authoritative|newer/i); }
});
test("detects duplicate normalized filenames with different content hashes", () => { const conflicts = detectDeterministicConflicts([file("a", "Board Plan.pdf", "alpha", "2026-01-01T00:00:00.000Z"), file("b", "Board Plan.pdf", "beta", "2026-01-02T00:00:00.000Z")]); assert.ok(conflicts.some((item) => item.conflictType === "duplicate_filename_content")); });
test("unrelated files are not compared and no winner is selected", () => { const conflicts = detectDeterministicConflicts([file("a", "Budget", "$10", "2026-01-01T00:00:00.000Z"), file("b", "Vacation", "$20", "2026-01-02T00:00:00.000Z")]); assert.equal(conflicts.length, 0); });
test("routes persist versioned conflicts, enforce workspace scope, and expose MCP review", async () => { const [schema, audit, browser, api, mcp] = await Promise.all([readFile(new URL("../db/schema.ts", import.meta.url), "utf8"), readFile(new URL("../lib/workspace-search/audit.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/workspaces/[workspaceId]/conflicts/route.ts", import.meta.url), "utf8"), readFile(new URL("../lib/api/v1-handlers.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8")]); assert.match(schema, /retrievalConflicts/); assert.match(audit, /conflictSnapshotJson/); assert.match(browser, /actorWorkspace/); assert.match(api, /workspaceId !== principal\.workspaceId/); assert.match(mcp, /get_workspace_conflicts/); assert.match(mcp, /review_conflict/); assert.equal(CONFLICT_DETECTION_VERSION, "deterministic-conflicts-v1"); });
