import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRetrievalReplay, failedReplayEvent, TRACE_EVENT_SCHEMA_VERSION } from "../lib/workspace-search/replay.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";

function file(id, name, content, overrides = {}) {
  return { id, workspaceId: "ws-a", connectorId: "connector-a", sourceId: id, name, mimeType: "application/vnd.google-apps.document", webViewLink: `https://docs.google.com/document/d/${id}`, modifiedAt: "2026-07-01T00:00:00.000Z", indexStatus: "indexed", extractionMethod: "structured", units: [{ id: `${id}-u`, unitType: "paragraph", unitIndex: 0, text: content, contentHash: `hash-${id}`, structuralLocation: "Paragraph 1" }], ...overrides };
}
function response(options = {}) {
  const files = options.files ?? [file("a", "Launch plan", "approved launch plan")];
  const value = searchWorkspaceFiles({ workspaceId: "ws-a", files, query: options.query ?? "launch", mode: options.mode ?? "best", fileType: "all", permissionContext: { authorizedFilesDiscovered: options.discovered ?? files.length, paginationComplete: options.paginationComplete ?? true, lastSuccessfulSyncAt: options.lastSyncAt ?? "2026-07-01T00:00:00.000Z", method: "drive_inventory", deniedStoredFiles: options.denied ?? 0 } });
  value.conflicts = options.conflicts ?? [];
  return value;
}
function replay(value) { return buildRetrievalReplay({ response: value, requestStartedAt: Date.parse("2026-07-18T00:00:00.000Z"), stageLatency: { authorizationMs: 2, permissionInventoryMs: 3, conflictLookupMs: 1, matchingMs: 4, confidenceMs: 1 }, receiptCreated: true, receiptDurationMs: 2 }); }

test("successful replay is versioned, complete, and deterministically ordered", () => {
  const events = replay(response());
  assert.equal(TRACE_EVENT_SCHEMA_VERSION, "retrieval-replay-v1");
  assert.deepEqual(events.map((item) => item.sequence), events.map((_, index) => index + 1));
  assert.deepEqual(events.map((item) => item.stage), ["authentication", "workspace_authorization", "connector_selection", "permission_inventory", "conflict_lookup", "coverage_evaluation", "candidate_generation", "permission_filtering", "literal_matching", "semantic_matching", "ranking", "citation_generation", "confidence_calculation", "receipt_creation"]);
  assert.equal(events.at(-1).status, "executed");
});
test("zero-result and Find All replay report observed behavior", () => {
  const zero = replay(response({ query: "zzzz-no-result" }));
  assert.ok(zero.find((item) => item.stage === "literal_matching").reasonCodes.includes("ZERO_RESULTS"));
  const all = replay(response({ mode: "all" }));
  assert.ok(all.find((item) => item.stage === "ranking").reasonCodes.includes("FIND_ALL_STABLE_ORDER"));
});
test("partial coverage, stale state, and permission filtering expose counts without source identities", () => {
  // One stored file is still authorized; four stored files are no longer in the Drive inventory.
  const events = replay(response({ discovered: 4, denied: 4, paginationComplete: false, lastSyncAt: "2020-01-01T00:00:00.000Z" }));
  const permission = events.find((item) => item.stage === "permission_filtering"), coverage = events.find((item) => item.stage === "coverage_evaluation");
  assert.equal(permission.inputCount, 5);
  assert.equal(permission.excludedCount, 4);
  assert.equal(permission.outputCount, 1);
  assert.equal(JSON.stringify(permission).includes("Launch plan"), false);
  assert.equal(coverage.metadata.stale, true);
  assert.ok(coverage.warningCount > 0);
});
test("unresolved conflict and semantic-disabled retrieval are explicit", () => {
  const events = replay(response({ conflicts: [{ status: "unresolved" }] }));
  assert.equal(events.find((item) => item.stage === "conflict_lookup").warningCount, 1);
  const semantic = events.find((item) => item.stage === "semantic_matching");
  assert.equal(semantic.status, "skipped");
  assert.deepEqual(semantic.reasonCodes, ["SEMANTIC_RETRIEVAL_DISABLED"]);
});
test("failed stages can be recorded without inventing unavailable measurements", () => {
  const event = failedReplayEvent({ sequence: 4, stage: "permission_inventory", reasonCode: "PERMISSION_REVALIDATION_FAILED" });
  assert.equal(event.status, "failed");
  assert.equal(event.startedAt, null);
  assert.equal(event.durationMs, null);
});
test("schema, serialization, UI, REST, and MCP preserve old traces and authorization", async () => {
  const [schema, audit, serialization, ui, browserRoute, apiRoute, mcp] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/workspace-search/audit.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/workspace-search/serialization.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/audit-viewer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/retrieval-traces/[traceId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/v1/retrieval-traces/[traceId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/mcp/tools.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /traceEventSchemaVersion/);
  assert.match(audit, /traceEventsJson/);
  assert.match(serialization, /row\.traceEventsJson \?/);
  assert.match(serialization, /: null/);
  assert.match(ui, /Replay unavailable/);
  assert.doesNotMatch(ui, /<b>Receipt creation<\/b>/);
  assert.match(browserRoute, /requireTraceAccess/);
  assert.match(apiRoute, /requireWorkspaceApiKey/);
  assert.match(mcp, /versioned persisted replay events/);
});
