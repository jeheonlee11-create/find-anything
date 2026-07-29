/**
 * Write fences and counter arithmetic for indexing continuations.
 *
 * Kept in its own alias-free module so tests can build the REAL drizzle
 * predicates and inspect the generated SQL, rather than asserting on source
 * text. Two invariants live here:
 *
 * 1. Only the hop that still holds the execution lease may commit. Without the
 *    fence, a lease-expired zombie hop's late commit overwrote job counters
 *    and forked the continuation chain.
 * 2. UI progress is DB-backed and true: in-hop heartbeats may only raise a
 *    counter, and per-hop event counts accumulate instead of being replaced by
 *    the next hop's zero.
 */
import { and, eq, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { indexingContinuations } from "../../db/schema.ts";

export function continuationExecutionFence(input: {
  jobId: string;
  continuationId: string;
  leaseOwner?: string | null;
}) {
  return and(
    eq(indexingContinuations.id, input.continuationId),
    eq(indexingContinuations.jobId, input.jobId),
    eq(indexingContinuations.status, "worker_started"),
    input.leaseOwner
      ? eq(indexingContinuations.executionLeaseOwner, input.leaseOwner)
      : undefined,
  );
}

/** A counter write that can only go up. */
export function monotonicCounter(column: AnySQLiteColumn, value: number) {
  return sql`max(${column}, ${value})`;
}

/** A per-hop event count that accumulates across continuations. */
export function accumulatedCounter(column: AnySQLiteColumn, value: number) {
  return sql`${column} + ${value}`;
}
