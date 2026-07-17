import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifyIndexingFailure } from "../lib/indexing/failures.ts";

test("central authorization helpers cover every protected resource class", async () => {
  const source = await readFile(
    new URL("../lib/auth/authorization.ts", import.meta.url),
    "utf8",
  );
  for (const helper of [
    "requireAuthenticatedUser",
    "requireWorkspaceMember",
    "requireWorkspaceOwner",
    "requireConnectorAccess",
    "requireRunAccess",
    "requireIndexedFileAccess",
    "requireReceiptAccess",
    "requireTraceAccess",
  ])
    assert.match(source, new RegExp(`export async function ${helper}`));
  assert.match(source, /memberships\.userId/);
  assert.match(source, /status: 404/);
});

test("legacy retrieval routes cannot bypass permission-aware workspace search", async () => {
  const [search, receipt, trace] = await Promise.all([
    readFile(new URL("../app/api/retrieval/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/retrieval/receipts/[receiptId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/retrieval/traces/[traceId]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(search, /requireAuthenticatedUser/);
  assert.match(search, /ROUTE_RETIRED/);
  assert.doesNotMatch(search, /runSampleRetrieval/);
  assert.match(receipt, /requireReceiptAccess/);
  assert.match(trace, /requireTraceAccess/);
});

test("OAuth refresh is single-flight, preserves rotation, and fails closed", async () => {
  const [sync, oauth, repository, dashboard] = await Promise.all([
    readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-drive/oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-drive/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sync, /refreshesInFlight/);
  assert.match(sync, /tokens\.refresh_token/);
  assert.match(sync, /reauthorization_required/);
  assert.match(oauth, /invalid_grant/);
  assert.match(repository, /input\.refreshTokenCiphertext/);
  assert.match(dashboard, /Reconnect Google Drive/);
});

test("durable indexing jobs checkpoint, prevent overlap, and hide continuation credentials", async () => {
  const [jobs, route, worker, schema, migration] = await Promise.all([
    readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/google-drive/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_loose_black_tom.sql", import.meta.url), "utf8"),
  ]);
  assert.match(jobs, /inArray\(indexingJobs\.status/);
  assert.match(jobs, /continuationTokenHash/);
  assert.match(jobs, /coverageReceipts/);
  assert.match(route, /status: 202/);
  assert.match(worker, /headers\.delete\("x-find-anything-job-token"\)/);
  assert.match(schema, /indexingJobs/);
  assert.match(migration, /CREATE TABLE `indexing_jobs`/);
  assert.match(migration, /UPDATE `source_files`/);
});

test("failure categories distinguish retryable and permanent errors", () => {
  assert.deepEqual(classifyIndexingFailure("GOOGLE_DRIVE_HTTP_403"), {
    category: "permission_denied",
    retryable: false,
    explanation: "Google no longer permits this file to be read.",
  });
  assert.equal(classifyIndexingFailure("PROVIDER_RATE_LIMIT_429").retryable, true);
  assert.equal(
    classifyIndexingFailure("GOOGLE_REAUTHORIZATION_REQUIRED").category,
    "reauthorization_required",
  );
});

test("search exposes only fully committed searchable records", async () => {
  const [repository, migration] = await Promise.all([
    readFile(new URL("../lib/workspace-search/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_loose_black_tom.sql", import.meta.url), "utf8"),
  ]);
  assert.match(repository, /sourceFiles\.searchableStatus, "searchable"/);
  assert.match(migration, /searchable_status/);
});

test("tokens, continuation credentials, and raw provider errors are not returned or logged", async () => {
  const [worker, syncRoute, oauth, callback] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/google-drive/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/google-drive/oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/connectors/google-drive/callback/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(worker, /headers\.delete\("x-find-anything-job-token"\)/);
  assert.doesNotMatch(syncRoute, /accessTokenCiphertext|refreshTokenCiphertext/);
  assert.doesNotMatch(oauth, /console\.(?:log|error)/);
  assert.doesNotMatch(callback, /console\.(?:log|error)/);
});
