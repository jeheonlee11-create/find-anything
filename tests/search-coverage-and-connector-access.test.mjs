import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCoverageInventory } from "../lib/workspace-search/coverage-map.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import {
  classifyConnectorFailure,
  connectorSearchAccess,
  hasAcceptedDriveScope,
  permanentConnectorFailure,
} from "../lib/google-drive/connector-health.ts";

// --- Coverage: hidden failed/unsupported files must be counted, never searched.

const searchableFile = (id, indexStatus, text = "needle budget") => ({
  id, workspaceId: "ws_a", connectorId: "c_a", sourceId: `src_${id}`, name: `Needle ${id}`,
  mimeType: "application/vnd.google-apps.document", modifiedAt: "2026-07-01T00:00:00.000Z", webViewLink: null,
  indexStatus, extractionError: null, extractionMode: indexStatus === "indexed" ? "structured" : null, structuralFallbackReason: null,
  units: indexStatus === "indexed" ? [{ id: `u_${id}`, unitType: "paragraph", text, structuralLocation: { paragraph: 1 }, contentHash: `h_${id}` }] : [],
});
const row = (id, indexStatus, searchableStatus, workspaceId = "ws_a") => ({ id, workspaceId, indexStatus, searchableStatus, extractionMode: null });
const search = (files, coverageRows, query = "needle") => searchWorkspaceFiles({
  workspaceId: "ws_a", files, coverageRows, query, mode: "best", fileType: "all",
  permissionContext: { authorizedFilesDiscovered: 4, paginationComplete: true, lastSuccessfulSyncAt: new Date().toISOString() },
});

test("search coverage counts hidden failed and unsupported files and is not complete", () => {
  // What indexedWorkspaceFiles returns: searchable rows only.
  const files = [searchableFile("ok", "indexed"), searchableFile("ok2", "indexed")];
  // What workspaceCoverageRows returns: the same rows plus hidden ones.
  const coverageRows = [row("ok", "indexed", "searchable"), row("ok2", "indexed", "searchable"), row("broken", "failed", "hidden"), row("video", "unsupported", "hidden")];
  const result = search(files, coverageRows);

  assert.equal(result.coverage.failedFiles, 1);
  assert.equal(result.coverage.unsupportedFiles, 1);
  assert.equal(result.coverage.totalKnownFiles, 4);
  assert.equal(result.coverage.filesSearched, 2);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.incompleteReasons.some((reason) => reason.includes("1 files failed indexing")));
  assert.ok(result.coverage.incompleteReasons.some((reason) => reason.includes("unsupported")));
  assert.equal(result.coverage.snapshot.status, "partial");
  assert.equal(result.coverage.snapshot.counts.failed, 1);
  assert.equal(result.coverage.snapshot.counts.unsupported, 1);
  assert.equal(result.coverage.snapshot.counts.searchable, 2);
  // Hidden rows are authorization-checked for the denominator but never searched.
  assert.deepEqual(result.results.map((item) => item.id).sort(), ["ok", "ok2"]);
  assert.ok(result.results.every((item) => item.citations.every((citation) => citation.fileId !== "broken" && citation.fileId !== "video")));
  assert.ok(result.diagnostics.permissionDecisions.length >= result.coverage.totalKnownFiles);
});

test("search coverage is complete only when every authorized file is indexed", () => {
  const files = [searchableFile("ok", "indexed"), searchableFile("ok2", "indexed")];
  const result = search(files, [row("ok", "indexed", "searchable"), row("ok2", "indexed", "searchable")]);
  assert.equal(result.coverage.failedFiles, 0);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.coverage.incompleteReasons, []);
});

test("search and the coverage endpoint share one coverage computation", () => {
  const coverageRows = [row("ok", "indexed", "searchable"), row("meta", "metadata", "searchable"), row("broken", "failed", "hidden"), row("video", "unsupported", "hidden"), row("queued", "pending", "hidden")];
  const summary = summarizeCoverageInventory(coverageRows, { paginationComplete: true });
  const result = search([searchableFile("ok", "indexed"), searchableFile("meta", "metadata")], coverageRows);
  assert.deepEqual(
    { indexed: result.coverage.indexedFiles, metadataOnly: result.coverage.metadataOnlyFiles, failed: result.coverage.failedFiles, pending: result.coverage.pendingFiles, unsupported: result.coverage.unsupportedFiles, knownInventoryRows: result.coverage.totalKnownFiles, incompleteReasons: result.coverage.incompleteReasons, complete: result.coverage.complete },
    { indexed: summary.indexed, metadataOnly: summary.metadataOnly, failed: summary.failed, pending: summary.pending, unsupported: summary.unsupported, knownInventoryRows: summary.knownInventoryRows, incompleteReasons: summary.incompleteReasons, complete: summary.complete },
  );
  assert.deepEqual(
    { indexed: summary.indexed, metadataOnly: summary.metadataOnly, failed: summary.failed, pending: summary.pending, unsupported: summary.unsupported, searchable: summary.searchable, processed: summary.processed, eligibleSupported: summary.eligibleSupported, complete: summary.complete },
    { indexed: 1, metadataOnly: 1, failed: 1, pending: 1, unsupported: 1, searchable: 1, processed: 3, eligibleSupported: 3, complete: false },
  );
});

test("coverage rows from another workspace are ignored", () => {
  const result = search([searchableFile("ok", "indexed")], [row("ok", "indexed", "searchable"), row("other", "failed", "hidden", "ws_b")]);
  assert.equal(result.coverage.failedFiles, 0);
  assert.equal(result.coverage.totalKnownFiles, 1);
});

test("without coverage rows, coverage still derives from the searched files", () => {
  const result = search([searchableFile("ok", "indexed"), searchableFile("meta", "metadata")], undefined);
  assert.equal(result.coverage.totalKnownFiles, 2);
  assert.equal(result.coverage.metadataOnlyFiles, 1);
  assert.equal(result.coverage.complete, false);
});

// --- Connector status: refreshes and transient errors must not disable search.

test("search is allowed while connected, syncing, or refreshing a token", () => {
  for (const status of ["connected", "syncing", "token_refreshing"])
    assert.deepEqual(connectorSearchAccess({ status, lastErrorCode: null }), { allowed: true }, status);
});

test("a transient last error does not block search", () => {
  for (const lastErrorCode of ["GOOGLE_WWW_HTTP_503", "GOOGLE_OAUTH_TEMPORARILY_UNAVAILABLE", "GOOGLE_TOKEN_REFRESH_FAILED", "GOOGLE_WWW_HTTP_429", "GOOGLE_TOKEN_REFRESH_TIMEOUT"])
    assert.equal(connectorSearchAccess({ status: "error", lastErrorCode }).allowed, true, lastErrorCode);
});

test("permanent failures block search with a clear reason", () => {
  const revoked = connectorSearchAccess({ status: "reauthorization_required", lastErrorCode: "GOOGLE_REAUTHORIZATION_REQUIRED" });
  assert.equal(revoked.allowed, false);
  assert.equal(revoked.code, "GOOGLE_REAUTHORIZATION_REQUIRED");
  assert.match(revoked.message, /Reconnect Google Drive/);
  for (const lastErrorCode of ["GOOGLE_OAUTH_TOKEN_ERROR", "GOOGLE_WWW_HTTP_403", null]) {
    const access = connectorSearchAccess({ status: "error", lastErrorCode });
    assert.equal(access.allowed, false, String(lastErrorCode));
    assert.equal(access.code, "GOOGLE_DRIVE_NEEDS_ATTENTION");
  }
  assert.equal(connectorSearchAccess(null).code, "GOOGLE_DRIVE_NOT_CONNECTED");
  assert.equal(connectorSearchAccess({ status: "revoked" }).code, "GOOGLE_DRIVE_NOT_CONNECTED");
});

test("failures are classified into retryable and permanent outcomes", () => {
  const cases = [
    [{ code: "invalid_grant", retryable: false }, "reauthorization_required", false],
    [{ code: "revoked", retryable: false }, "reauthorization_required", false],
    [{ code: "temporarily_unavailable", retryable: true }, "connected", true],
    [{ code: "token_error", retryable: false }, "error", false],
    [new Error("GOOGLE_REFRESH_TOKEN_MISSING"), "reauthorization_required", false],
    [new Error("GOOGLE_REQUIRED_SCOPE_MISSING"), "reauthorization_required", false],
    [new Error("GOOGLE_WWW_HTTP_401"), "reauthorization_required", false],
    [new Error("GOOGLE_WWW_HTTP_403"), "error", false],
    [new Error("GOOGLE_WWW_HTTP_500"), "connected", true],
    [new Error("GOOGLE_WWW_HTTP_503"), "connected", true],
    [new Error("GOOGLE_WWW_HTTP_429"), "connected", true],
    [new Error("GOOGLE_PERMISSION_INVENTORY_INCOMPLETE"), "connected", true],
    [new Error("GOOGLE_TOKEN_REFRESH_TIMEOUT"), "connected", true],
    [new TypeError("fetch failed"), "connected", true],
  ];
  for (const [error, status, retryable] of cases) {
    const failure = classifyConnectorFailure(error);
    const label = error instanceof Error ? error.message : error.code;
    assert.equal(failure.status, status, label);
    assert.equal(failure.retryable, retryable, label);
    // Whatever a failure persists, search afterwards is allowed exactly when it was transient.
    assert.equal(connectorSearchAccess({ status: failure.status, lastErrorCode: failure.code }).allowed, retryable, label);
  }
});

test("a search-time revalidation failure blocks only when it is permanent", () => {
  assert.equal(permanentConnectorFailure(new Error("GOOGLE_WWW_HTTP_503")), null);
  assert.equal(permanentConnectorFailure({ code: "temporarily_unavailable", retryable: true }), null);
  assert.equal(permanentConnectorFailure({ code: "invalid_grant", retryable: false }).code, "GOOGLE_REAUTHORIZATION_REQUIRED");
  assert.equal(permanentConnectorFailure(new Error("GOOGLE_REQUIRED_SCOPE_MISSING")).code, "GOOGLE_REAUTHORIZATION_REQUIRED");
  assert.equal(permanentConnectorFailure({ code: "token_error", retryable: false }).code, "GOOGLE_DRIVE_NEEDS_ATTENTION");
});

test("a refreshed token must still carry an accepted Drive scope", () => {
  assert.equal(hasAcceptedDriveScope("openid https://www.googleapis.com/auth/drive.file"), true);
  assert.equal(hasAcceptedDriveScope("https://www.googleapis.com/auth/drive.readonly"), true);
  assert.equal(hasAcceptedDriveScope(undefined), true);
  assert.equal(hasAcceptedDriveScope("openid email"), false);
});
