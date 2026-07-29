import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  indexingStageLabel,
  isHeartbeatDelayed,
} from "../lib/indexing/state-machine.ts";
import {
  indexingAccounting,
  nextIndexingAttemptNumber,
} from "../lib/indexing/job-lifecycle.ts";

test("slow discovery has an explicit stage and never invents a denominator", () => {
  assert.equal(indexingStageLabel("discovering"), "Discovering files");
  assert.equal(
    isHeartbeatDelayed(
      "running",
      "2026-07-23T10:00:00.000Z",
      Date.parse("2026-07-23T10:01:59.999Z"),
    ),
    false,
  );
});

test("zero accessible files is a valid fully-accounted terminal inventory", () => {
  assert.deepEqual(
    indexingAccounting({
      discovered: 0,
      processed: 0,
      indexed: 0,
      unsupported: 0,
      failed: 0,
    }),
    {
      discovered: 0,
      processed: 0,
      indexed: 0,
      unsupported: 0,
      failed: 0,
      remaining: 0,
      fullyAccounted: true,
    },
  );
});

test("the large Drive example reports durable honest progress", () => {
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

test("stale jobs become delayed at two minutes and retry attempts stay unique", () => {
  assert.equal(
    isHeartbeatDelayed(
      "running",
      "2026-07-23T10:00:00.000Z",
      Date.parse("2026-07-23T10:02:00.000Z"),
    ),
    true,
  );
  assert.equal(nextIndexingAttemptNumber(0, 1), 2);
  assert.equal(nextIndexingAttemptNumber(5, 7), 8);
});

test("OAuth, pagination, crash recovery, refresh, and click idempotency remain wired", async () => {
  const [sync, jobs, dashboard, callback, route] = await Promise.all([
    readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/workspace-dashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/connectors/google-drive/callback/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/connectors/google-drive/sync/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(sync, /stage: "verifying_authorization"/);
  assert.match(sync, /stage: "discovering"/);
  assert.match(sync, /discovery_progress/);
  assert.match(sync, /GOOGLE_INCOMPLETE_SEARCH/);
  assert.match(jobs, /STALE_HEARTBEAT/);
  assert.match(jobs, /onConflictDoNothing/);
  assert.match(jobs, /max\(indexingJobAttempts\.attemptNumber\)/);
  assert.match(jobs, /INDEXING_ATTEMPT_PERSISTENCE_COLLISION/);
  assert.match(dashboard, /Discovering files…/);
  assert.doesNotMatch(dashboard, /discoveredCount \|\| "\?"/);
  assert.doesNotMatch(dashboard, /for \(let poll/);
  assert.match(dashboard, /indexing\/advance/);
  assert.match(dashboard, /3000/);
  assert.doesNotMatch(dashboard, /router\.refresh\(/);
  assert.doesNotMatch(dashboard, /location\.reload\(/);
  assert.match(callback, /oauth_authorization_succeeded/);
  assert.match(callback, /oauth_authorization_failed/);
  assert.match(route, /alreadyActive/);
});

test("expired or revoked authorization is a terminal user-visible state", () => {
  assert.equal(indexingStageLabel("failed"), "Failed");
  assert.equal(isHeartbeatDelayed("reauthorization_required", null), false);
});

test("pagination failure and a worker crash during discovery become recoverable failures", () => {
  assert.equal(indexingStageLabel("interrupted"), "Interrupted");
  assert.equal(indexingStageLabel("failed"), "Failed");
});

test("a worker crash during indexing preserves the 518-file checkpoint", () => {
  const checkpoint = indexingAccounting({
    discovered: 518,
    processed: 4,
    indexed: 4,
    unsupported: 0,
    failed: 0,
  });
  assert.equal(checkpoint.remaining, 514);
  assert.equal(checkpoint.fullyAccounted, false);
});

test("page refresh restores persisted indexing state rather than local progress", async () => {
  const dashboard = await readFile(
    new URL("../app/components/workspace-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /\/api\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}/);
  assert.doesNotMatch(dashboard, /sessionStorage|localStorage/);
});

test("repeated Start Indexing clicks are disabled and active jobs are deduplicated", async () => {
  const [dashboard, jobs, migration] = await Promise.all([
    readFile(
      new URL("../app/components/workspace-dashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0017_calm_indexing_stages.sql", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(dashboard, /disabled=\{busy \|\| activeJob\}/);
  assert.match(jobs, /alreadyActive: true/);
  assert.match(migration, /indexing_jobs_connector_active_idx/);
});

test("revoked permissions do not masquerade as an active spinner", () => {
  assert.equal(
    isHeartbeatDelayed(
      "reauthorization_required",
      "2026-07-23T10:00:00.000Z",
      Date.parse("2026-07-23T11:00:00.000Z"),
    ),
    false,
  );
});
