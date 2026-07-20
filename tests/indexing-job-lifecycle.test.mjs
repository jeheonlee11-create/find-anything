import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  indexingAccounting,
  isIndexingJobStale,
  nextIndexingAttemptNumber,
} from "../lib/indexing/job-lifecycle.ts";

test("an orphaned attempt advances from the highest persisted attempt", () => {
  assert.equal(nextIndexingAttemptNumber(0, 1), 2);
});

test("interrupted continuations and repeated retries never reuse attempt numbers", () => {
  assert.equal(nextIndexingAttemptNumber(4, 4), 5);
  assert.equal(nextIndexingAttemptNumber(0, 3), 4);
  assert.equal(nextIndexingAttemptNumber(7, 3), 8);
});

test("the observed 518 discovered and 4 processed state has an honest denominator", () => {
  assert.deepEqual(
    indexingAccounting({
      discovered: 518,
      processed: 4,
      indexed: 4,
      unsupported: 0,
      failed: 0,
    }),
    {
      discovered: 518,
      processed: 4,
      indexed: 4,
      unsupported: 0,
      failed: 0,
      remaining: 514,
      fullyAccounted: false,
    },
  );
});

test("completion requires every discovered file to be accounted for", () => {
  assert.equal(indexingAccounting({ discovered: 518, processed: 517, indexed: 500, unsupported: 17, failed: 0 }).fullyAccounted, false);
  assert.equal(indexingAccounting({ discovered: 518, processed: 518, indexed: 500, unsupported: 17, failed: 1 }).fullyAccounted, true);
});

test("stale running jobs recover without a second user action", () => {
  const now = Date.parse("2026-07-20T04:20:00.000Z");
  assert.equal(isIndexingJobStale("2026-07-20T04:16:09.875Z", now), true);
  assert.equal(isIndexingJobStale("2026-07-20T04:19:30.000Z", now), false);
});

test("job persistence, stale recovery, and cross-request continuation stay wired", async () => {
  const [jobs, worker, dashboard, workspaceRoute] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[workspaceId]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /max\(indexingJobAttempts\.attemptNumber\)/);
  assert.match(jobs, /INDEXING_ATTEMPT_PERSISTENCE_FAILED/);
  assert.match(jobs, /filesUnsupported/);
  assert.match(jobs, /INDEXING_INVENTORY_UNACCOUNTED/);
  assert.match(worker, /Give each bounded batch its own Worker request lifetime/);
  assert.match(worker, /await fetch\(/);
  assert.match(worker, /dispatchInternalContinuation/);
  assert.doesNotMatch(worker, /handler\.fetch\(\s*new Request\(continuationUrl/);
  assert.match(dashboard, /Indexing \$\{job\.processedCount\} of \$\{job\.discoveredCount\} files/);
  assert.match(dashboard, /remaining/);
  assert.match(dashboard, /unsupportedCount/);
  assert.match(dashboard, /setInterval\(\(\) => void load\(true\), 5000\)/);
  assert.doesNotMatch(dashboard, /router\.refresh\(/);
  assert.doesNotMatch(dashboard, /location\.reload\(/);
  assert.match(workspaceRoute, /isIndexingJobStale/);
  assert.match(workspaceRoute, /enqueueIndexingJob/);
  assert.match(workspaceRoute, /x-find-anything-job-token/);
});
