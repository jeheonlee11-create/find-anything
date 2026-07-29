# Managed indexing queue architecture

Status: local implementation only. Migration 0018 is unapplied and no
Cloudflare resources, secrets, billing, or production data have been changed.

## Boundary

The existing Site remains the system of record and the only component with a
Sites-managed D1 binding. A separate Cloudflare Worker owns a Queue producer,
Queue consumer, dead-letter consumer, and one-minute scheduled reconciler. It
does not bind D1.

The Site and Queue Worker exchange versioned continuation messages over signed
HTTPS requests. Messages contain only job and continuation identifiers,
sequence, attempt epoch, and request time. They never contain Google tokens,
user identity, filenames, queries, extracted text, or credentials.

## Lifecycle

1. The Site transaction commits an indexing checkpoint and a unique persisted
   continuation row.
2. The Site submits the versioned message to the Queue Worker ingress.
3. The Worker writes it to the managed Queue and acknowledges dispatch to the
   Site.
4. The Queue consumer calls the signed Site execution endpoint.
5. The Site atomically leases the continuation and runs one bounded batch.
6. Completion is idempotently stored. A next continuation is persisted before
   the response is returned.
7. Queue retries handle transient failures. Exhausted messages enter the DLQ,
   whose consumer records an honest terminal scheduling failure through the
   Site.

If step 1 completes and the originating process terminates before step 2, the
independent one-minute Cron Trigger asks the Site for due or expired-dispatch
rows, leases them, and enqueues them. The same path recovers dispatched rows
that never reached an acknowledged worker start.

## Idempotency and leasing

- `(job_id, sequence)` is unique.
- Messages also carry `attempt_epoch`.
- Dispatch and execution have separate lease owners and expirations.
- Fresh execution leases reject overlap.
- Expired leases are recoverable.
- A replay after a committed batch returns the stored terminal result and does
  not process files again.
- Queue retries use exponential delay.
- The primary queue has a DLQ and bounded consumer concurrency.

## Required Cloudflare account actions

Nothing in this section has been performed.

1. Confirm ownership of the Cloudflare account that will own the Worker.
2. Create `find-anything-indexing` and
   `find-anything-indexing-dlq`.
3. Create/deploy one Worker from `queue-worker/`.
4. Configure its producer, primary consumer, DLQ consumer, and one-minute Cron
   Trigger using the reviewed Wrangler configuration.
5. Set Worker secrets `INDEXING_QUEUE_INGRESS_SECRET` and
   `INDEXING_QUEUE_SERVICE_SECRET`.
6. Set Site variables `INDEXING_QUEUE_DISPATCH_URL`,
   `INDEXING_QUEUE_INGRESS_SECRET`, and
   `INDEXING_QUEUE_SERVICE_SECRET`.
7. Restrict the Worker ingress to the generated endpoint and rotate both
   secrets independently during rollout.
8. Apply additive migration 0018 through the normal forward-only Sites
   migration process before enabling Queue dispatch.
9. Observe queue backlog, retries, DLQ depth, Cron events, signed endpoint
   errors, continuation lease age, and job heartbeat.

## Local simulation

The simulation deliberately terminates the originating request after
persisting a continuation. A later scheduled reconcile drains that row without
a browser, processes 1,294 files in bounded ten-file batches, and executes
each sequence exactly once. It also covers lost responses, duplicate
deliveries, stale execution leases, send failures, discovery and indexing
crashes, OAuth expiry, revoked permissions, zero accessible files, DLQ
exhaustion, and unacknowledged dispatch recovery.
