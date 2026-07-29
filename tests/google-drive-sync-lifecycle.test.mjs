import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  isStaleSync,
  isExtractableDriveMimeType,
  MAX_FILE_RETRIES,
  planSyncContinuation,
  priorityClass,
  reconcileInterruptedRun,
  sortPendingDriveFiles,
  terminalSyncStatus,
} from "../lib/google-drive/sync-lifecycle.ts";

test("an interrupted run with persisted files reconciles to partial", () => {
  const recovered = reconcileInterruptedRun(
    { filesDiscovered: 0, paginationComplete: false },
    [
      { indexStatus: "indexed", extractionMode: "structured", trashed: false },
      { indexStatus: "indexed", extractionMode: "fallback", trashed: false },
      { indexStatus: "failed", extractionMode: null, trashed: false },
      { indexStatus: "indexed", extractionMode: "structured", trashed: true },
    ],
  );
  assert.deepEqual(recovered, {
    status: "partial",
    filesDiscovered: 3,
    filesIndexed: 2,
    filesFailed: 1,
    structuredFiles: 1,
    fallbackFiles: 1,
    paginationComplete: false,
  });
});

test("an interrupted run without indexed files reconciles to failed", () => {
  assert.equal(
    terminalSyncStatus({ filesIndexed: 0, filesFailed: 0 }, true),
    "failed",
  );
});

test("completed runs distinguish complete, partial, and failed", () => {
  assert.equal(
    terminalSyncStatus({ filesIndexed: 12, filesFailed: 0 }),
    "complete",
  );
  assert.equal(
    terminalSyncStatus({ filesIndexed: 11, filesFailed: 1 }),
    "partial",
  );
  assert.equal(
    terminalSyncStatus({ filesIndexed: 0, filesFailed: 3 }),
    "failed",
  );
});

test("stale-run detection does not take over a fresh active run", () => {
  const now = Date.parse("2026-07-16T12:00:00.000Z");
  assert.equal(isStaleSync("2026-07-16T11:54:59.999Z", now), true);
  assert.equal(isStaleSync("2026-07-16T11:55:00.001Z", now), false);
});

test("large-Drive continuation skips completed native files and advances", () => {
  const inventory = [
      { id: "native", modifiedTime: "2026-07-01" },
      { id: "structured", modifiedTime: "2026-07-02" },
      { id: "new", modifiedTime: "2026-07-03" },
    ],
    plan = planSyncContinuation(inventory, [
      {
        sourceId: "native",
        modifiedAt: "2026-07-01",
        indexStatus: "indexed",
        extractionMode: "native",
      },
      {
        sourceId: "structured",
        modifiedAt: "2026-07-02",
        indexStatus: "indexed",
        extractionMode: "structured",
      },
    ]);
  assert.deepEqual(plan.pendingFiles.map((file) => file.id), ["new"]);
  assert.equal(plan.filesProcessed, 2);
  assert.equal(plan.filesIndexed, 2);
  assert.equal(plan.filesFailed, 0);
  assert.equal(plan.structuredFiles, 1);
});

test("a file quarantined by a terminated batch does not block continuation", () => {
  const plan = planSyncContinuation(
    [
      { id: "interrupted", modifiedTime: "2026-07-04" },
      { id: "next", modifiedTime: "2026-07-05" },
    ],
    [
      {
        sourceId: "interrupted",
        modifiedAt: "2026-07-04",
        indexStatus: "failed",
        extractionMode: null,
      },
    ],
  );
  assert.deepEqual(plan.pendingFiles.map((file) => file.id), ["next"]);
  assert.equal(plan.filesFailed, 1);
});

test("metadata-only files are separated from extractable Drive formats", () => {
  assert.equal(isExtractableDriveMimeType("application/pdf"), true);
  assert.equal(
    isExtractableDriveMimeType("application/vnd.google-apps.document"),
    true,
  );
  assert.equal(isExtractableDriveMimeType("image/png"), false);
  assert.equal(isExtractableDriveMimeType("application/zip"), false);
});

test("hash-identical duplicates are separated from unchanged and modified files", () => {
  const plan = planSyncContinuation(
    [
      { id: "unchanged", modifiedTime: "2026-07-01", md5Checksum: "aaa" },
      { id: "duplicate", modifiedTime: "2026-07-20", md5Checksum: "bbb" },
      { id: "modified", modifiedTime: "2026-07-21", md5Checksum: "ccc" },
      { id: "google-native", modifiedTime: "2026-07-22" },
    ],
    [
      { sourceId: "unchanged", modifiedAt: "2026-07-01", indexStatus: "indexed", extractionMode: "native", contentHash: "aaa", retryCount: 0 },
      // Timestamp moved but content identical: metadata refresh only.
      { sourceId: "duplicate", modifiedAt: "2026-07-02", indexStatus: "indexed", extractionMode: "native", contentHash: "bbb", retryCount: 0 },
      // Timestamp moved and hash differs: must re-extract.
      { sourceId: "modified", modifiedAt: "2026-07-03", indexStatus: "indexed", extractionMode: "native", contentHash: "old", retryCount: 0 },
      // Google-native files carry no md5: timestamp move means re-extract.
      { sourceId: "google-native", modifiedAt: "2026-07-04", indexStatus: "indexed", extractionMode: "structured", contentHash: null, retryCount: 0 },
    ],
  );
  assert.deepEqual(plan.pendingFiles.map((file) => file.id), ["modified", "google-native"]);
  assert.deepEqual(plan.duplicateFiles.map((file) => file.id), ["duplicate"]);
  assert.equal(plan.filesUnchanged, 1);
  assert.equal(plan.filesDuplicate, 1);
  assert.equal(plan.filesProcessed, 2);
  assert.equal(plan.filesIndexed, 2);
});

test("a hash match never settles a file that was only metadata-indexed", () => {
  const plan = planSyncContinuation(
    [{ id: "new", modifiedTime: "2026-07-10", md5Checksum: "abc" }],
    [{ sourceId: "new", modifiedAt: "2026-07-10", indexStatus: "metadata", extractionMode: null, contentHash: "abc", retryCount: 0 }],
  );
  assert.deepEqual(plan.pendingFiles.map((file) => file.id), ["new"]);
  assert.equal(plan.filesDuplicate, 0);
  assert.equal(plan.filesProcessed, 0);
});

test("failed files below the retry budget are surfaced as retryable", () => {
  const plan = planSyncContinuation(
    [
      { id: "retry-me", modifiedTime: "2026-07-01" },
      { id: "exhausted", modifiedTime: "2026-07-02" },
    ],
    [
      { sourceId: "retry-me", modifiedAt: "2026-07-01", indexStatus: "failed", extractionMode: null, contentHash: null, retryCount: MAX_FILE_RETRIES - 1 },
      { sourceId: "exhausted", modifiedAt: "2026-07-02", indexStatus: "failed", extractionMode: null, contentHash: null, retryCount: MAX_FILE_RETRIES },
    ],
  );
  assert.deepEqual(plan.retryableFiles.map((file) => file.id), ["retry-me"]);
  assert.equal(plan.filesFailed, 2);
  assert.equal(plan.pendingFiles.length, 0);
});

test("priorityClass buckets recency, format, size, and prior failures deterministically", () => {
  const now = Date.parse("2026-07-29T00:00:00.000Z");
  const recentDoc = { id: "a", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-07-20T00:00:00.000Z", size: "100" };
  const oldPdf = { id: "b", mimeType: "application/pdf", modifiedTime: "2025-01-01T00:00:00.000Z", size: "100" };
  const otherSupported = { id: "c", mimeType: "application/rtf", modifiedTime: "2026-07-20T00:00:00.000Z", size: "100" };
  const largePdf = { id: "d", mimeType: "application/pdf", modifiedTime: "2026-07-20T00:00:00.000Z", size: String(20 * 1024 * 1024) };
  assert.equal(priorityClass(recentDoc, { now }), 0);
  assert.equal(priorityClass(oldPdf, { now }), 1);
  assert.equal(priorityClass(otherSupported, { now }), 2);
  assert.equal(priorityClass(largePdf, { now }), 3);
  assert.equal(priorityClass(recentDoc, { now, previouslyFailed: true }), 3);
});

test("pending files sort by (priority class, size ascending, modified descending)", () => {
  const now = Date.parse("2026-07-29T00:00:00.000Z");
  const files = [
    { id: "large", mimeType: "application/pdf", modifiedTime: "2026-07-25T00:00:00.000Z", size: String(30 * 1024 * 1024) },
    { id: "old-big-doc", mimeType: "application/vnd.google-apps.document", modifiedTime: "2025-05-01T00:00:00.000Z", size: "900" },
    { id: "recent-doc", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-07-21T00:00:00.000Z", size: "500" },
    { id: "recent-small-pdf", mimeType: "application/pdf", modifiedTime: "2026-07-19T00:00:00.000Z", size: "200" },
    { id: "old-small-doc", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-01-01T00:00:00.000Z", size: "100" },
    { id: "previously-failed", mimeType: "application/pdf", modifiedTime: "2026-07-27T00:00:00.000Z", size: "50" },
  ];
  const sorted = sortPendingDriveFiles(files, {
    now,
    previouslyFailed: (id) => id === "previously-failed",
  });
  assert.deepEqual(sorted.map((file) => file.id), [
    "recent-small-pdf",
    "recent-doc",
    "old-small-doc",
    "old-big-doc",
    "previously-failed",
    "large",
  ]);
});

test("sync checkpoints pagination and counters before terminal completion", async () => {
  const [sync, client, repository, dashboard] = await Promise.all([
    readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-drive/client.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/google-drive/repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/workspaces/repository.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(client, /onProgress/);
  assert.match(sync, /checkpointSync/);
  assert.match(sync, /SYNC_TOTAL_BUDGET_MS/);
  assert.match(sync, /SYNC_BATCH_SIZE/);
  assert.match(sync, /UNSUPPORTED_BATCH_SIZE/);
  assert.match(sync, /existingSourceFiles/);
  assert.match(sync, /SYNC_FILE_INTERRUPTED/);
  assert.match(sync, /continuationNeeded/);
  assert.match(repository, /SYNC_INTERRUPTED_RECOVERED/);
  assert.match(repository, /GOOGLE_SYNC_ALREADY_RUNNING/);
  assert.match(dashboard, /recoverStaleSyncRuns/);
});
