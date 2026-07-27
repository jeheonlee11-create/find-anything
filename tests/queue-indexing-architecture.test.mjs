import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { IndexingQueueCoordinator } from "../queue-worker/src/coordinator.ts";
import {
  SimulatedIndexingSite,
  SimulatedManagedQueue,
} from "../queue-worker/src/simulation.ts";
import {
  continuationMessage,
  signedServiceHeaders,
  verifyServiceRequest,
} from "../lib/indexing/queue-protocol.ts";

const secret = "local-test-secret-that-is-never-a-production-secret";

test("service authentication accepts an intact request and rejects tampering", async () => {
  const url = "https://app.findanything.dev/api/internal/indexing/queue/due",
    body = JSON.stringify({ leaseOwner: "local-test" }),
    headers = await signedServiceHeaders({
      secret,
      method: "POST",
      url,
      body,
      timestamp: "2026-07-23T12:00:00.000Z",
      nonce: "nonce-1",
    });
  assert.equal(
    (
      await verifyServiceRequest(
        new Request(url, { method: "POST", headers, body }),
        secret,
        Date.parse("2026-07-23T12:00:01.000Z"),
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await verifyServiceRequest(
        new Request(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ leaseOwner: "tampered" }),
        }),
        secret,
        Date.parse("2026-07-23T12:00:01.000Z"),
      )
    ).ok,
    false,
  );
});

test("expired service signatures fail closed", async () => {
  const url = "https://app.findanything.dev/api/internal/indexing/queue/due",
    body = "{}",
    headers = await signedServiceHeaders({
      secret,
      method: "POST",
      url,
      body,
      timestamp: "2026-07-23T12:00:00.000Z",
    });
  const verified = await verifyServiceRequest(
    new Request(url, { method: "POST", headers, body }),
    secret,
    Date.parse("2026-07-23T12:10:00.000Z"),
  );
  assert.equal(verified.ok, false);
  assert.equal(verified.code, "SERVICE_AUTH_EXPIRED");
});

test("browser-closed processing independently drains 1,294 files to completion", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(1294, 4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed");
  site.persistInitial();
  // The request/browser disappears before dispatch. A later scheduled
  // reconciliation is the only event that starts work.
  assert.deepEqual(await coordinator.reconcile(), { found: 1, dispatched: 1 });
  while (queue.messages.length) {
    const message = queue.take();
    assert.ok(message);
    await coordinator.consume(message);
  }
  assert.equal(site.processed, 1294);
  assert.equal(site.indexed, 1294);
  assert.equal(site.failed, 0);
  assert.equal(site.continuations.size, Math.ceil(1294 / 4));
  for (let sequence = 1; sequence <= site.continuations.size; sequence += 1)
    assert.equal(site.executionCount(sequence), 1);
});

test("a dispatched continuation never acknowledged or started is reconciled once", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
    message = site.persistInitial();
  await site.markDispatched(message);
  site.advance(121_000);
  assert.deepEqual(await coordinator.reconcile(), { found: 1, dispatched: 1 });
  assert.deepEqual(await coordinator.reconcile(), { found: 0, dispatched: 0 });
  await coordinator.consume(queue.take());
  assert.equal(site.processed, 4);
  assert.equal(site.executionCount(1), 1);
});

test("a response lost after committing a batch replays idempotently", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(8, 4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
    message = site.persistInitial();
  await site.markDispatched(message);
  // The Site committed the first batch, but the consumer never saw its
  // response. Redelivery gets the stored result and cannot process twice.
  await site.execute(message, "lost-response");
  await coordinator.consume(message);
  assert.equal(site.executionCount(1), 1);
  await coordinator.consume(queue.take());
  assert.equal(site.processed, 8);
});

test("a consumer crash before the Site call leaves the message available", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
    message = site.persistInitial();
  await coordinator.enqueue(message);
  const delivered = queue.take();
  assert.equal(site.processed, 0);
  await coordinator.consume(delivered);
  assert.equal(site.processed, 4);
});

test("stale execution leases recover while fresh leases reject overlap", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
    message = site.persistInitial(),
    record = site.continuations.get(message.continuationId);
  record.status = "worker_started";
  record.executionLeaseOwner = "crashed-worker";
  record.executionLeaseUntil = site.now + 60_000;
  await assert.rejects(coordinator.consume(message), /ALREADY_LEASED/);
  site.advance(61_000);
  await coordinator.consume(message);
  assert.equal(site.processed, 4);
});

test("a failed queue send releases reconciliation lease for a later trigger", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed");
  site.persistInitial();
  queue.failNextSend = true;
  assert.deepEqual(await coordinator.reconcile(), { found: 1, dispatched: 0 });
  site.advance(31_000);
  assert.deepEqual(await coordinator.reconcile(), { found: 1, dispatched: 1 });
  await coordinator.consume(queue.take());
  assert.equal(site.processed, 4);
});

test("dead-letter handling produces an honest terminal state", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
    message = site.persistInitial();
  await coordinator.consumeDeadLetter(message);
  assert.equal(site.terminalError, "QUEUE_DELIVERY_EXHAUSTED");
  assert.match(site.events.join(","), /dead_lettered:1/);
});

test("zero accessible files reaches a terminal completion without a spinner", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(0),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed");
  site.persistInitial();
  await coordinator.reconcile();
  const result = await coordinator.consume(queue.take());
  assert.equal(result.terminal, true);
  assert.equal(site.processed, 0);
});

for (const [name, code] of [
  ["slow Drive discovery", "SIMULATED_SLOW_DISCOVERY"],
  ["pagination failure", "GOOGLE_PAGINATION_FAILED"],
  ["worker crash during discovery", "WORKER_CRASH_DURING_DISCOVERY"],
  ["worker crash during indexing", "WORKER_CRASH_DURING_INDEXING"],
]) {
  test(`${name} remains retryable without losing its durable continuation`, async () => {
    const queue = new SimulatedManagedQueue(),
      site = new SimulatedIndexingSite(4),
      coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
      message = site.persistInitial();
    site.executeFailure = code;
    await assert.rejects(coordinator.consume(message), new RegExp(code));
    assert.equal(site.processed, 0);
    await coordinator.consume(message);
    assert.equal(site.processed, 4);
  });
}

for (const [name, code] of [
  ["expired OAuth token", "GOOGLE_REAUTHORIZATION_REQUIRED"],
  ["revoked Google permissions", "GOOGLE_PERMISSION_REVOKED"],
]) {
  test(`${name} terminates honestly and is acknowledged without an infinite retry`, async () => {
    const queue = new SimulatedManagedQueue(),
      site = new SimulatedIndexingSite(4),
      coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
      message = site.persistInitial();
    site.executeTerminalFailure = code;
    const result = await coordinator.consume(message);
    assert.equal(result.terminal, true);
    assert.equal(result.next, null);
    assert.equal(site.terminalError, code);
    assert.equal(site.processed, 0);
  });
}

test("implementation is isolated and never binds Sites D1 into the queue Worker", async () => {
  const [config, worker, migration, executeRoute, dueRoute] = await Promise.all([
    readFile(new URL("../queue-worker/wrangler.example.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../queue-worker/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0018_sweet_sheva_callister.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/queue/execute/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/internal/indexing/queue/due/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(config, /d1_databases|database_id/);
  assert.doesNotMatch(worker, /D1Database|env\.DB/);
  assert.match(config, /dead_letter_queue/);
  assert.match(config, /crons/);
  assert.match(migration, /dispatch_lease_expires_at/);
  assert.match(migration, /execution_lease_expires_at/);
  assert.match(executeRoute, /requireIndexingQueueService/);
  assert.match(dueRoute, /leaseDueIndexingContinuations/);
});

test("staging queue dispatch is fail-closed behind an explicit feature flag", async () => {
  const [worker, config] = await Promise.all([
    readFile(new URL("../queue-worker/src/index.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../queue-worker/wrangler.staging.jsonc", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(worker, /INDEXING_QUEUE_ENABLED === "true"/);
  assert.match(worker, /QUEUE_DISPATCH_DISABLED/);
  assert.match(config, /"INDEXING_QUEUE_ENABLED": "false"/);
  assert.match(config, /"SITE_ORIGIN": "https:\/\/staging-site\.invalid"/);
  assert.doesNotMatch(config, /app\.findanything\.dev/);
});

test("queue messages never contain credentials, identities, or file data", () => {
  const message = continuationMessage({
    jobId: "job_safe_payload",
    continuationId: "continuation_job_safe_payload_1",
    sequence: 1,
    attemptEpoch: 1,
  });
  const serialized = JSON.stringify(message);
  for (const forbidden of [
    "token",
    "secret",
    "email",
    "filename",
    "content",
    "workspaceId",
    "connectorId",
  ])
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
});

test("a crash at the batch-commit boundary rolls back with no partial effect", async () => {
  const queue = new SimulatedManagedQueue(),
    site = new SimulatedIndexingSite(12, 4),
    coordinator = new IndexingQueueCoordinator(queue, site, () => "fixed"),
    message = site.persistInitial();
  await site.markDispatched(message);
  // The worker leases the continuation and processes a batch, but the single
  // transaction that would persist the batch, advance counters, complete this
  // continuation, and persist the next one fails to commit.
  site.rollbackNextCommit = "SIMULATED_COMMIT_ROLLBACK";
  await assert.rejects(
    () => coordinator.consume(message),
    /SIMULATED_COMMIT_ROLLBACK/,
  );
  // Nothing durable advanced: counters untouched, no stored result, no next
  // continuation, the lease released, and the row is redeliverable.
  assert.equal(site.processed, 0);
  assert.equal(site.indexed, 0);
  assert.equal(site.executionCount(1), 0);
  assert.equal(site.continuations.size, 1);
  const record = site.continuations.get(message.continuationId);
  assert.equal(record.status, "persisted");
  assert.equal(record.result, null);
  assert.equal(record.executionLeaseOwner, null);
  // Redelivery of the same message commits exactly one batch — the rolled-back
  // attempt did not double-count files or persist a duplicate continuation.
  await coordinator.consume(message);
  assert.equal(site.processed, 4);
  assert.equal(site.executionCount(1), 1);
  assert.equal(site.continuations.size, 2);
  // The rest of the Drive drains to an exactly-once completion.
  while (queue.messages.length) await coordinator.consume(queue.take());
  assert.equal(site.processed, 12);
  assert.equal(site.indexed, 12);
  assert.equal(site.continuations.size, 3);
  for (let sequence = 1; sequence <= site.continuations.size; sequence += 1)
    assert.equal(site.executionCount(sequence), 1);
});
