import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  isStaleSync,
  planSyncContinuation,
  reconcileInterruptedRun,
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
  assert.equal(plan.structuredFiles, 1);
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
  assert.match(sync, /SYNC_PROCESSING_BUDGET_MS/);
  assert.match(sync, /SYNC_BATCH_SIZE/);
  assert.match(sync, /existingSourceFiles/);
  assert.match(sync, /continuationNeeded/);
  assert.match(repository, /SYNC_INTERRUPTED_RECOVERED/);
  assert.match(repository, /GOOGLE_SYNC_ALREADY_RUNNING/);
  assert.match(dashboard, /recoverStaleSyncRuns/);
});
