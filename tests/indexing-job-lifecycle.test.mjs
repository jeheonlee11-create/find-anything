import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  indexingAccounting,
  isIndexingJobStale,
  nextIndexingAttemptNumber,
} from "../lib/indexing/job-lifecycle.ts";
import { IndexingQueueCoordinator } from "../queue-worker/src/coordinator.ts";
import {
  SimulatedIndexingSite,
  SimulatedManagedQueue,
} from "../queue-worker/src/simulation.ts";

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
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "worker-1");
  site.persistInitial();
  assert.deepEqual(await coordinator.reconcile(), { found: 1, dispatched: 1 });
  await coordinator.consume(queue.take());
  assert.equal(site.processed, 4);
  assert.equal(site.executionCount(1), 1);
});

test("a failed follow-up schedule rejects instead of looking active", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "worker-1");
  site.persistInitial();
  queue.failNextSend = true;
  assert.deepEqual(await coordinator.reconcile(), { found: 1, dispatched: 0 });
  assert.equal(site.processed, 0);
});

test("job persistence, stale recovery, and cross-request continuation stay wired", async () => {
  const [jobs, worker, dashboard, workspaceRoute, advanceRoute, dueRoute, executeRoute, queueWorker, logging] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[workspaceId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[workspaceId]/indexing/advance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/queue/due/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/queue/execute/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../queue-worker/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/observability/indexing-log.ts", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /max\(indexingJobAttempts\.attemptNumber\)/);
  assert.match(jobs, /INDEXING_ATTEMPT_PERSISTENCE_FAILED/);
  assert.match(jobs, /filesUnsupported/);
  assert.match(jobs, /INDEXING_INVENTORY_UNACCOUNTED/);
  assert.match(worker, /enqueueWithManagedQueue/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /executeIndexingContinuation/);
  assert.match(jobs, /indexingContinuations/);
  assert.match(jobs, /continuation_persisted/);
  assert.match(dashboard, /Indexing \$\{job\.processedCount\} of \$\{job\.discoveredCount\} files/);
  assert.match(dashboard, /remaining/);
  assert.match(dashboard, /unsupportedCount/);
  assert.match(dashboard, /indexing\/advance/);
  assert.match(dashboard, /3000/);
  assert.doesNotMatch(dashboard, /router\.refresh\(/);
  assert.doesNotMatch(dashboard, /location\.reload\(/);
  assert.doesNotMatch(workspaceRoute, /enqueueIndexingJob/);
  assert.match(advanceRoute, /isIndexingJobStale/);
  assert.match(advanceRoute, /enqueueIndexingJob/);
  assert.match(advanceRoute, /x-find-anything-continuation-sequence/);
  assert.match(dueRoute, /leaseDueIndexingContinuations/);
  assert.match(executeRoute, /claimQueueContinuationExecution/);
  assert.match(executeRoute, /queueClaimed: true/);
  assert.match(queueWorker, /async queue/);
  assert.match(queueWorker, /async scheduled/);
  for (const event of [
    "recovery_requested",
    "queue_dispatch_persisted",
    "queue_worker_started",
    "attempt_created",
    "queue_message_retried",
  ])
    assert.match(logging, new RegExp(`"${event}"`));
});

test("a stale connecting recovery starts exactly one attempt before discovery", async () => {
  const [jobs, worker, executeRoute, sync] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/queue/execute/route.ts", import.meta.url), "utf8"),
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
  assert.match(worker, /enqueueWithManagedQueue/);
  assert.match(executeRoute, /runIndexingJob\([\s\S]*body\.message\.jobId[\s\S]*body\.message\.continuationId/);
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

test("scheduling failure is durably retryable and first-run active UI hides the ready panel", async () => {
  const [jobs, queueWorker, dashboard] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../queue-worker/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /releaseQueueDispatchLease/);
  assert.match(queueWorker, /coordinator\(env\)\.reconcile/);
  assert.match(queueWorker, /consumeDeadLetter/);
  assert.match(dashboard, /\) : activeJob \? null : \(/);
  assert.match(dashboard, /Ready to build your searchable index/);
});

test("the 1,294 discovered and zero processed boundary checkpoints before extraction", async () => {
  const sync = await readFile(
    new URL("../lib/google-drive/sync.ts", import.meta.url),
    "utf8",
  );
  assert.match(sync, /discoveryOnly\?: boolean;/);
  assert.match(sync, /if \(options\.discoveryOnly\)/);
  assert.match(sync, /DISCOVERY_CHECKPOINT_COMPLETE/);
  assert.match(sync, /filesDeferred: Math\.max\(0, discovered - filesProcessed\)/);
  assert.match(sync, /processingDeadline = Date\.now\(\) \+ SYNC_TOTAL_BUDGET_MS/);
  assert.deepEqual(
    indexingAccounting({
      discovered: 1294,
      processed: 0,
      indexed: 0,
      unsupported: 0,
      failed: 0,
    }),
    {
      discovered: 1294,
      processed: 0,
      indexed: 0,
      unsupported: 0,
      failed: 0,
      remaining: 1294,
      fullyAccounted: false,
    },
  );
});

test("multiple durable processing continuations can reach completion", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(16, 4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "worker-1");
  site.persistInitial();
  await coordinator.reconcile();
  while (queue.messages.length) await coordinator.consume(queue.take());
  const processed = site.processed;
  assert.equal(processed, 16);
  assert.equal(
    indexingAccounting({
      discovered: 16,
      processed,
      indexed: 16,
      unsupported: 0,
      failed: 0,
    }).fullyAccounted,
    true,
  );
});

test("an acknowledged fresh-worker handoff uses the queue or the free Worker fallback", async () => {
  const [worker, queueWorker] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../queue-worker/src/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /enqueueWithManagedQueue/);
  assert.match(queueWorker, /async queue/);
  assert.match(queueWorker, /async scheduled/);
  assert.match(worker, /ctx\.waitUntil/);
  assert.match(worker, /api\/internal\/indexing\/continue/);
  assert.doesNotMatch(worker, /window\.|document\./);
});

test("the independent scheduled trigger drains persisted continuations", async () => {
  const source = await readFile(new URL("../queue-worker/src/index.ts", import.meta.url), "utf8");
  assert.match(source, /async scheduled/);
  assert.match(source, /coordinator\(env\)\.reconcile/);
});

test("the independent scheduled trigger recovers unacknowledged dispatches", async () => {
  const [source, config] = await Promise.all([
    readFile(new URL("../queue-worker/src/coordinator.ts", import.meta.url), "utf8"),
    readFile(new URL("../queue-worker/wrangler.example.jsonc", import.meta.url), "utf8"),
  ]);
  assert.match(source, /claimDue/);
  assert.match(config, /"\* \* \* \* \*"/);
});

// --- Queue-less continuation chaining (the production path) ---

const hopResponse = (ok, headers = {}) => ({
  ok,
  headers: { get: (name) => headers[name] ?? null },
  arrayBuffer: async () => new ArrayBuffer(0),
});
const firstHop = {
  jobId: "job_1",
  jobToken: "token_1",
  continuationId: "continuation_job_1_1",
};

test("a detached continuation hands the chain to a fresh invocation", async () => {
  const { executeIndexingContinuation } = await import(
    "../worker/indexing-continuation.ts"
  );
  const calls = { dispatch: 0, detached: 0, inProcess: 0 };
  const result = await executeIndexingContinuation({
    hop: firstHop,
    persistDispatch: async () => (calls.dispatch += 1, hopResponse(true)),
    startDetachedWorker: async () => (calls.detached += 1, hopResponse(true)),
    startInProcessWorker: async () => {
      calls.inProcess += 1;
      return hopResponse(true);
    },
  });
  assert.deepEqual(result, { dispatched: true, detached: true, hops: 0 });
  assert.deepEqual(calls, { dispatch: 1, detached: 1, inProcess: 0 });
});

test("a refused detached request degrades to in-process chaining until headers stop", async () => {
  const { executeIndexingContinuation } = await import(
    "../worker/indexing-continuation.ts"
  );
  const calls = { dispatch: 0, detached: 0, inProcess: 0 };
  const result = await executeIndexingContinuation({
    hop: firstHop,
    persistDispatch: async () => (calls.dispatch += 1, hopResponse(true)),
    startDetachedWorker: async () => {
      calls.detached += 1;
      throw new Error("SELF_FETCH_BLOCKED");
    },
    startInProcessWorker: async (hop) => {
      calls.inProcess += 1;
      // First hop returns a chained continuation; second hop is terminal.
      return calls.inProcess === 1
        ? hopResponse(true, {
            "x-find-anything-job-id": hop.jobId,
            "x-find-anything-continuation-id": "continuation_job_1_2",
            "x-find-anything-job-token": hop.jobToken,
          })
        : hopResponse(true);
    },
  });
  assert.deepEqual(result, { dispatched: true, detached: false, hops: 2 });
  assert.deepEqual(calls, { dispatch: 2, detached: 2, inProcess: 2 });
});

test("the chain respects the wall clock and the hop cap", async () => {
  const {
    executeIndexingContinuation,
    CONTINUATION_CHAIN_MAX_HOPS,
    CONTINUATION_CHAIN_WALL_CLOCK_MS,
  } = await import("../worker/indexing-continuation.ts");
  // Hop cap: endless chained headers still stop at the cap.
  const unbounded = await executeIndexingContinuation({
    hop: firstHop,
    persistDispatch: async () => hopResponse(true),
    startInProcessWorker: async (hop) =>
      hopResponse(true, {
        "x-find-anything-job-id": hop.jobId,
        "x-find-anything-continuation-id": `${hop.continuationId}x`,
      }),
  });
  assert.equal(unbounded.hops, CONTINUATION_CHAIN_MAX_HOPS);
  // Wall clock: a slow first hop leaves no time for a second.
  let clock = 0;
  const timed = await executeIndexingContinuation({
    hop: firstHop,
    now: () => clock,
    persistDispatch: async () => hopResponse(true),
    startInProcessWorker: async (hop) => {
      clock += CONTINUATION_CHAIN_WALL_CLOCK_MS;
      return hopResponse(true, {
        "x-find-anything-job-id": hop.jobId,
        "x-find-anything-continuation-id": `${hop.continuationId}x`,
      });
    },
  });
  assert.equal(timed.hops, 1);
});

test("a failed dispatch stops the chain before any hop runs", async () => {
  const { executeIndexingContinuation } = await import(
    "../worker/indexing-continuation.ts"
  );
  let hopRan = false;
  await assert.rejects(
    executeIndexingContinuation({
      hop: firstHop,
      persistDispatch: async () => hopResponse(false),
      startInProcessWorker: async () => {
        hopRan = true;
        return hopResponse(true);
      },
    }),
    /CONTINUATION_SCHEDULING_FAILED/,
  );
  assert.equal(hopRan, false);
});

test("detached continuations are schedulable end to end", async () => {
  const [continueRoute, worker, dashboard, syncRoute] = await Promise.all([
    readFile(new URL("../app/api/internal/indexing/continue/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/google-drive/sync/route.ts", import.meta.url), "utf8"),
  ]);
  // The continue response must carry the full header set the wrapper needs
  // to schedule the following hop from a fresh invocation.
  assert.match(continueRoute, /x-find-anything-continuation-sequence/);
  assert.match(continueRoute, /x-find-anything-attempt-epoch/);
  // The wrapper prefers a real network request (fresh subrequest budget) and
  // bounds it, keeping the in-process hop as the degraded path.
  assert.match(worker, /startDetachedWorker/);
  assert.match(worker, /AbortSignal\.timeout/);
  assert.match(worker, /NEXT_PUBLIC_SITE_URL \|\| request\.url/);
  assert.match(worker, /startInProcessWorker/);
  // The UI no longer promises unattended completion the platform has not
  // demonstrated: it must not claim leaving the page is always safe.
  assert.doesNotMatch(dashboard, /You may leave this page/);
  assert.doesNotMatch(syncRoute, /You may safely close this page/);
  assert.match(dashboard, /progress is saved if you leave/i);
});
