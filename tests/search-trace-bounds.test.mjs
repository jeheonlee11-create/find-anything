import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RECORDED_DECISIONS, searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { buildRetrievalReplay } from "../lib/workspace-search/replay.ts";

const DOC = "application/vnd.google-apps.document";

function workspace(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `file_${index}`,
    workspaceId: "ws_a",
    connectorId: "conn",
    sourceId: `src_${index}`,
    name: `File ${index}`,
    mimeType: DOC,
    modifiedAt: "2026-07-01T00:00:00.000Z",
    webViewLink: null,
    indexStatus: "indexed",
    extractionError: null,
    extractionMode: "structured",
    structuralFallbackReason: null,
    units: [{ id: `u_${index}`, unitType: "doc_paragraph", text: index % 10 === 0 ? "needle here" : "hay only", structuralLocation: { paragraphIndex: 0 }, contentHash: `h_${index}` }],
  }));
}

test("a search over a large workspace records bounded decisions and full counts", () => {
  const response = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files: workspace(20_000),
    query: "needle",
    mode: "all",
    fileType: "all",
    pageSize: 50,
    permissionContext: { authorizedFilesDiscovered: 20_000, paginationComplete: true, lastSuccessfulSyncAt: null, method: "drive_inventory", deniedStoredFiles: 7 },
  });
  const { diagnostics } = response;
  assert.equal(response.totalMatches, 2_000);
  assert.equal(diagnostics.permissionDecisions.length, 50);
  assert.equal(diagnostics.thresholdDecisions.length, 50);
  assert.equal(diagnostics.indexSnapshot.length, 50);
  assert.equal(diagnostics.excludedResults.length, MAX_RECORDED_DECISIONS);
  assert.deepEqual(diagnostics.permissionSummary, { method: "drive_inventory", evaluated: 20_007, allowed: 20_000, denied: 7 });
  assert.deepEqual(diagnostics.thresholdSummary, { evaluated: 20_000, included: 2_000, excluded: 18_000 });
  // The whole stored diagnostic payload stays far below D1's 2 MB row limit.
  assert.ok(JSON.stringify(diagnostics).length < 50_000, `diagnostics were ${JSON.stringify(diagnostics).length} bytes`);
});

test("each recorded permission decision is the real allow reason for a returned result", () => {
  const response = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files: workspace(30),
    query: "needle",
    mode: "best",
    fileType: "all",
    permissionContext: { authorizedFilesDiscovered: 30, paginationComplete: true, lastSuccessfulSyncAt: null, method: "drive_inventory", deniedStoredFiles: 2 },
  });
  assert.deepEqual(response.diagnostics.permissionDecisions.map((item) => item.fileId), response.results.map((item) => item.id));
  for (const decision of response.diagnostics.permissionDecisions) assert.match(decision.reason, /Drive inventory .* at query time/);
  // Denied rows are counted, never named.
  assert.equal(response.diagnostics.permissionSummary.denied, 2);
  assert.equal(JSON.stringify(response.diagnostics).includes("denied_"), false);
});

test("replay uses each measured stage duration, including candidate loading", () => {
  const response = searchWorkspaceFiles({ workspaceId: "ws_a", files: workspace(10), query: "needle", mode: "best", fileType: "all" });
  const events = buildRetrievalReplay({
    response,
    requestStartedAt: 0,
    stageLatency: { authorizationMs: 1, permissionInventoryMs: 40, loadFilesMs: 9, conflictLookupMs: 2, matchingMs: 3, confidenceMs: 1 },
  });
  const duration = (stage) => events.find((item) => item.stage === stage).durationMs;
  assert.equal(duration("permission_inventory"), 40);
  assert.equal(duration("candidate_generation"), 9);
  assert.equal(duration("literal_matching"), 3);
});
