import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  indexingAccounting,
  isIndexingJobStale,
  nextIndexingAttemptNumber,
} from "../lib/indexing/job-lifecycle.ts";
import { executeIndexingContinuation } from "../worker/indexing-continuation.ts";

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

test("the recovered first hop starts one worker and reaches discovery", async () => {
  let attempts = 0,
    discoveries = 0,
    outboundRequests = 0;
  const response = (headers = new Headers()) => ({
      ok: true,
      headers,
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    }),
    result = await executeIndexingContinuation({
      jobId: "job_stale_connecting",
      jobToken: "local-test-token",
      startWorker: async () => {
        attempts += 1;
        discoveries += 1;
        return response();
      },
      scheduleNext: async () => {
        outboundRequests += 1;
        return response();
      },
    });
  assert.deepEqual(result, { started: true, scheduledNext: false });
  assert.equal(attempts, 1);
  assert.equal(discoveries, 1);
  assert.equal(outboundRequests, 0);
});

test("a failed follow-up schedule rejects instead of looking active", async () => {
  const headers = new Headers({
    "x-find-anything-job-id": "job_needs_next_batch",
    "x-find-anything-job-token": "local-test-token",
  });
  await assert.rejects(
    executeIndexingContinuation({
      jobId: "job_needs_next_batch",
      jobToken: "local-test-token",
      startWorker: async () => ({
        ok: true,
        headers,
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
      }),
      scheduleNext: async () => ({
        ok: false,
        headers: new Headers(),
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
      }),
    }),
    /CONTINUATION_SCHEDULING_FAILED/,
  );
});

test("job persistence, stale recovery, and cross-request continuation stay wired", async () => {
  const [jobs, worker, dashboard, workspaceRoute, continueRoute, failureRoute, logging] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[workspaceId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/continue/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/scheduling-failure/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/observability/indexing-log.ts", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /max\(indexingJobAttempts\.attemptNumber\)/);
  assert.match(jobs, /INDEXING_ATTEMPT_PERSISTENCE_FAILED/);
  assert.match(jobs, /filesUnsupported/);
  assert.match(jobs, /INDEXING_INVENTORY_UNACCOUNTED/);
  assert.match(worker, /runInternalContinuation/);
  assert.match(worker, /handler\.fetch/);
  assert.match(worker, /scheduleNext: \(\) => fetch\(/);
  assert.match(worker, /markSchedulingFailure/);
  assert.match(dashboard, /Indexing \$\{job\.processedCount\} of \$\{job\.discoveredCount\} files/);
  assert.match(dashboard, /remaining/);
  assert.match(dashboard, /unsupportedCount/);
  assert.match(dashboard, /setInterval\(\(\) => void load\(true\), 5000\)/);
  assert.doesNotMatch(dashboard, /router\.refresh\(/);
  assert.doesNotMatch(dashboard, /location\.reload\(/);
  assert.match(workspaceRoute, /isIndexingJobStale/);
  assert.match(workspaceRoute, /enqueueIndexingJob/);
  assert.match(workspaceRoute, /x-find-anything-job-token/);
  assert.match(continueRoute, /worker_started/);
  assert.match(continueRoute, /runIndexingJob/);
  assert.match(failureRoute, /failIndexingJobScheduling/);
  for (const event of [
    "recovery_requested",
    "continuation_scheduled",
    "worker_started",
    "attempt_created",
    "scheduling_failure",
  ])
    assert.match(logging, new RegExp(`"${event}"`));
});

test("a stale connecting recovery starts exactly one attempt before discovery", async () => {
  const [jobs, worker, continueRoute, sync] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/continue/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /eq\(indexingJobs\.updatedAt, existing\.updatedAt\)/);
  assert.match(jobs, /eq\(indexingJobs\.continuationTokenHash, tokenHash\)/);
  assert.match(jobs, /onConflictDoNothing\(\)\.returning/);
  assert.match(jobs, /logIndexingEvent\("attempt_created"/);
  assert.match(jobs, /synchronizeGoogleDrive\(connector/);
  assert.ok(
    jobs.indexOf('logIndexingEvent("attempt_created"') <
      jobs.indexOf("synchronizeGoogleDrive(connector"),
  );
  assert.match(worker, /handler\.fetch\(/);
  assert.match(continueRoute, /runIndexingJob\(jobId, token\)/);
  assert.match(sync, /logIndexingEvent\("discovery_started"/);
});

test("concurrent stale polling cannot create duplicate attempts", async () => {
  const jobs = await readFile(
    new URL("../lib/indexing/jobs.ts", import.meta.url),
    "utf8",
  );
  assert.match(jobs, /eq\(indexingJobs\.updatedAt, existing\.updatedAt\)/);
  assert.match(jobs, /if \(!recovered\)[\s\S]*alreadyActive: true/);
  assert.match(jobs, /max\(indexingJobAttempts\.attemptNumber\)/);
  assert.match(jobs, /onConflictDoNothing\(\)/);
  assert.match(jobs, /INDEXING_ATTEMPT_PERSISTENCE_COLLISION/);
});

test("scheduling failure becomes terminal and first-run active UI hides the ready panel", async () => {
  const [jobs, worker, dashboard] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /CONTINUATION_SCHEDULING_FAILED/);
  assert.match(jobs, /status: "failed"/);
  assert.match(jobs, /terminalReason: "CONTINUATION_SCHEDULING_FAILED"/);
  assert.match(worker, /\.catch\(\s*\(\) => markSchedulingFailure/);
  assert.match(dashboard, /\) : activeJob \? null : \(/);
  assert.match(dashboard, /Ready to build your searchable index/);
});
