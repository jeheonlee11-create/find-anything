import assert from "node:assert/strict";
import test from "node:test";
import { buildCoverageSnapshot, COVERAGE_SNAPSHOT_VERSION } from "../lib/workspace-search/coverage-map.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { readFile } from "node:fs/promises";

test("coverage distinguishes observable source, indexing, and permission ratios", () => {
  const snapshot = buildCoverageSnapshot({ authorization: "authorized", authorizedDiscovered: 10, knownInventoryRows: 8, indexed: 5, searchable: 4, failed: 1, pending: 2, unsupported: 1, knownRemovedOrUnauthorized: 2, paginationComplete: false, lastSuccessfulSyncAt: "2026-07-01T00:00:00.000Z", observedAt: "2026-07-18T00:00:00.000Z" });
  assert.equal(snapshot.version, COVERAGE_SNAPSHOT_VERSION);
  assert.equal(snapshot.metrics.knownSourceCoverage, .8);
  assert.equal(snapshot.metrics.indexingSuccess, .8333);
  assert.equal(snapshot.metrics.searchableCoverage, .5);
  assert.equal(snapshot.metrics.permissionAccessibility, .8333);
  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.freshness.status, "stale");
  assert.ok(snapshot.incompleteReasons.some((reason) => reason.includes("pagination")));
});

test("coverage does not invent inaccessible systems when no connector is observable", () => {
  const snapshot = buildCoverageSnapshot({ authorization: "unavailable", authorizedDiscovered: 0, knownInventoryRows: 0, indexed: 0, searchable: 0, failed: 0, pending: 0, unsupported: 0, paginationComplete: false, lastSuccessfulSyncAt: null });
  assert.equal(snapshot.status, "not_connected");
  assert.equal(snapshot.metrics.permissionAccessibility, null);
  assert.match(snapshot.limitations.join(" "), /No unconfigured connectors/);
});

test("search snapshots remain workspace isolated and report partial indexing", () => {
  const file = (id, workspaceId, indexStatus) => ({ id, workspaceId, connectorId: `c_${workspaceId}`, sourceId: id, name: "Needle", mimeType: "application/vnd.google-apps.document", modifiedAt: "2026-07-01T00:00:00.000Z", webViewLink: null, indexStatus, extractionError: null, extractionMode: "structured", structuralFallbackReason: null, units: indexStatus === "indexed" ? [{ id: `u_${id}`, unitType: "paragraph", text: "needle", structuralLocation: {}, contentHash: id }] : [] });
  const result = searchWorkspaceFiles({ workspaceId: "ws_a", files: [file("own", "ws_a", "indexed"), file("pending", "ws_a", "pending"), file("other", "ws_b", "indexed")], query: "needle", mode: "best", fileType: "all", permissionContext: { authorizedFilesDiscovered: 2, paginationComplete: true, lastSuccessfulSyncAt: "2026-07-18T00:00:00.000Z" } });
  assert.deepEqual(result.results.map((item) => item.id), ["own"]);
  assert.equal(result.coverage.snapshot.counts.knownInventoryRows, 2);
  assert.equal(result.coverage.snapshot.counts.pending, 1);
  assert.equal(result.coverage.snapshot.status, "partial");
});
test("five-file stale regression scenario uses exact observable denominators", () => {
  const snapshot = buildCoverageSnapshot({ authorization: "authorized", authorizedDiscovered: 3, knownInventoryRows: 3, indexed: 1, searchable: 1, failed: 1, pending: 1, unsupported: 0, knownRemovedOrUnauthorized: 1, paginationComplete: true, lastSuccessfulSyncAt: "2026-06-01T00:00:00.000Z", observedAt: "2026-07-18T00:00:00.000Z" });
  assert.deepEqual(snapshot.counts, { authorizedDiscovered: 3, knownInventoryRows: 3, indexed: 1, searchable: 1, failed: 1, pending: 1, unsupported: 0, knownRemovedOrUnauthorized: 1 });
  assert.deepEqual(snapshot.metrics, { knownSourceCoverage: 1, indexingSuccess: .5, searchableCoverage: .3333, permissionAccessibility: .75 });
  assert.equal(snapshot.freshness.status, "stale"); assert.equal(snapshot.status, "partial");
});
test("coverage UI uses the API snapshot and audit stores the identical object without logging content", async () => {
  const [ui, audit, coverageRoute] = await Promise.all([readFile(new URL("../app/components/workspace-coverage-map.tsx", import.meta.url), "utf8"), readFile(new URL("../lib/workspace-search/audit.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/workspaces/[workspaceId]/coverage/route.ts", import.meta.url), "utf8")]);
  assert.match(ui, /setCoverage\(value\.snapshot \?\? value\)/);
  assert.match(coverageRoute, /liveWorkspaceCoverage/);
  assert.equal((audit.match(/JSON\.stringify\(coverage\.snapshot\)/g) ?? []).length, 1);
  assert.doesNotMatch(audit, /console\.(?:log|error).*coverage/);
});

test("coverage UI exposes readable warning and limitation hooks for accessible dark mode", async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL("../app/components/workspace-coverage-map.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /coverage-limitations/);
  assert.match(ui, /className="coverage-warning" role="alert"/);
  assert.match(css, /\.content-page \.coverage-card \.definition-grid p\{color:#d7dcd1/);
  assert.match(css, /\.content-page \.coverage-card \.coverage-warning/);
});
