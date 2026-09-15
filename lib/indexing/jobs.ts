import { and, desc, eq, inArray, lte, max, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accumulatedCounter,
  continuationExecutionFence,
  monotonicCounter as monotonic,
} from "@/lib/indexing/continuation-fence";
import {
  connectors,
  coverageReceipts,
  indexingContinuations,
  indexingJobAttempts,
  indexingJobs,
} from "@/db/schema";
import { synchronizeGoogleDrive } from "@/lib/google-drive/sync";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { refreshWorkspaceConflicts } from "@/lib/conflicts/repository";
import { nextIndexingAttemptNumber } from "@/lib/indexing/job-lifecycle";
import { logIndexingEvent } from "@/lib/observability/indexing-log";
import {
  continuationMessage,
  type IndexingQueueMessage,
} from "@/lib/indexing/queue-protocol";

export const INDEXING_VERSION = "literal-v1";
export const EXTRACTION_VERSION = "structural-v1";
const resumable = ["queued", "partial", "stale", "failed", "cancelled"] as const;
const active = ["queued", "running", "pausing", "stale"] as const;
const retryable = [...active, "partial", "failed", "cancelled"] as const;

export async function enqueueIndexingJob(input: {
  workspaceId: string;
  connectorId: string;
  actorId: string;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    token = randomToken(),
    tokenHash = await sha256(token),
    existing = await db
      .select()
      .from(indexingJobs)
      .where(
        and(
          eq(indexingJobs.connectorId, input.connectorId),
          inArray(indexingJobs.status, [...retryable]),
        ),
      )
      .orderBy(desc(indexingJobs.updatedAt))
      .get();
  if (existing) {
    const heartbeat = existing.heartbeatAt ?? existing.updatedAt,
      fresh = Date.now() - Date.parse(heartbeat) < 120_000;
    if (["queued", "running", "pausing"].includes(existing.status) && fresh)
      return {
        jobId: existing.id,
        continuationToken: null,
        resumed: true,
        alreadyActive: true,
      };
    logIndexingEvent("recovery_requested", {
      workspaceId: existing.workspaceId,
      connectorId: existing.connectorId,
      jobId: existing.id,
      stage: existing.stage,
    });
    const persistedContinuation = await db
        .select({ value: max(indexingContinuations.sequence) })
        .from(indexingContinuations)
        .where(eq(indexingContinuations.jobId, existing.id))
        .get(),
      continuationSequence =
        Math.max(
          existing.continuationCount,
          persistedContinuation?.value ?? 0,
        ) + 1,
      continuationId = continuationDispatchId(
        existing.id,
        continuationSequence,
      );
    await db.batch([
      db
        .update(indexingJobAttempts)
        .set({
          status: "interrupted",
          completedAt: now,
          heartbeatAt: now,
          errorCode: "STALE_HEARTBEAT",
        })
        .where(
          and(
            eq(indexingJobAttempts.jobId, existing.id),
            eq(indexingJobAttempts.status, "running"),
          ),
        ),
      db
        .update(indexingJobs)
        .set({
          status: "queued",
          stage: "connecting",
          continuationTokenHash: tokenHash,
          retryCount: existing.retryCount + 1,
          terminalReason: null,
          lastErrorCode: null,
          heartbeatAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(indexingJobs.id, existing.id),
            eq(indexingJobs.updatedAt, existing.updatedAt),
          ),
        ),
      db
        .insert(indexingContinuations)
        .values({
          id: continuationId,
          jobId: existing.id,
          sequence: continuationSequence,
          attemptEpoch: existing.retryCount + 1,
          status: "persisted",
          persistedAt: now,
          availableAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing(),
    ]);
    const recovered = await db
      .select({ id: indexingJobs.id })
      .from(indexingJobs)
      .where(
        and(
          eq(indexingJobs.id, existing.id),
          eq(indexingJobs.continuationTokenHash, tokenHash),
          eq(indexingJobs.status, "queued"),
        ),
      )
      .get();
    if (!recovered)
      return {
        jobId: existing.id,
        continuationToken: null,
        resumed: true,
        alreadyActive: true,
      };
    logIndexingEvent("stale_job_recovered", {
      workspaceId: existing.workspaceId,
      connectorId: existing.connectorId,
      jobId: existing.id,
      stage: "connecting",
    });
    logIndexingEvent("continuation_persisted", {
      workspaceId: existing.workspaceId,
      connectorId: existing.connectorId,
      jobId: existing.id,
      continuationId,
      stage: "connecting",
    });
    return {
      jobId: existing.id,
      continuationToken: token,
      continuationId,
      continuationSequence,
      attemptEpoch: existing.retryCount + 1,
      resumed: true,
      alreadyActive: false,
    };
  }
  const jobId = `job_${crypto.randomUUID()}`;
  const continuationId = continuationDispatchId(jobId, 1);
  try {
    await db.batch([
      db.insert(indexingJobs).values({
        id: jobId,
        workspaceId: input.workspaceId,
        connectorId: input.connectorId,
        requestedByUserId: input.actorId,
        status: "queued",
        stage: "connecting",
        discoveryStatus: "not_started",
        continuationTokenHash: tokenHash,
        deploymentVersion: process.env.APP_VERSION ?? "unknown",
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(indexingContinuations).values({
        id: continuationId,
        jobId,
        sequence: 1,
        attemptEpoch: 1,
        status: "persisted",
        persistedAt: now,
        availableAt: now,
        updatedAt: now,
      }),
    ]);
  } catch (error) {
    const winner = await db
      .select({ id: indexingJobs.id })
      .from(indexingJobs)
      .where(
        and(
          eq(indexingJobs.connectorId, input.connectorId),
          inArray(indexingJobs.status, [...active]),
        ),
      )
      .get();
    if (winner)
      return {
        jobId: winner.id,
        continuationToken: null,
        resumed: true,
        alreadyActive: true,
      };
    throw error;
  }
  logIndexingEvent("continuation_persisted", {
    workspaceId: input.workspaceId,
    connectorId: input.connectorId,
    jobId,
    continuationId,
    stage: "connecting",
  });
  return {
    jobId,
    continuationToken: token,
    continuationId,
    continuationSequence: 1,
    attemptEpoch: 1,
    resumed: false,
    alreadyActive: false,
  };
}

export function queueMessageFromEnqueueResult(input: {
  jobId: string;
  continuationId?: string;
  continuationSequence?: number;
  attemptEpoch?: number;
}) {
  if (
    !input.continuationId ||
    !input.continuationSequence ||
    !input.attemptEpoch
  )
    return null;
  return continuationMessage({
    jobId: input.jobId,
    continuationId: input.continuationId,
    sequence: input.continuationSequence,
    attemptEpoch: input.attemptEpoch,
  });
}

export async function resumePersistedContinuation(jobId: string) {
  const db = await getDb(),
    continuation = await db
      .select({
        id: indexingContinuations.id,
        sequence: indexingContinuations.sequence,
        attemptEpoch: indexingContinuations.attemptEpoch,
      })
      .from(indexingContinuations)
      .where(
        and(
          eq(indexingContinuations.jobId, jobId),
          eq(indexingContinuations.status, "persisted"),
        ),
      )
      .orderBy(desc(indexingContinuations.sequence))
      .get();
  if (!continuation) return null;
  const token = randomToken(),
    tokenHash = await sha256(token),
    now = new Date().toISOString(),
    job = await db
      .update(indexingJobs)
      .set({
        continuationTokenHash: tokenHash,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingJobs.id, jobId),
          inArray(indexingJobs.status, [...resumable]),
        ),
      )
      .returning({ id: indexingJobs.id })
      .get();
  if (!job) return null;
  return {
    jobId,
    continuationToken: token,
    continuationId: continuation.id,
    continuationSequence: continuation.sequence,
    attemptEpoch: continuation.attemptEpoch,
  };
}

export async function leaseDueIndexingContinuations(input: {
  leaseOwner: string;
  limit?: number;
  now?: string;
  staleDispatchBefore?: string;
  leaseMs?: number;
}) {
  const db = await getDb(),
    now = input.now ?? new Date().toISOString(),
    staleDispatchBefore =
      input.staleDispatchBefore ??
      new Date(Date.parse(now) - 120_000).toISOString(),
    leaseExpiresAt = new Date(
      Date.parse(now) + (input.leaseMs ?? 60_000),
    ).toISOString(),
    candidates = await db
      .select({
        id: indexingContinuations.id,
        jobId: indexingContinuations.jobId,
        sequence: indexingContinuations.sequence,
        attemptEpoch: indexingContinuations.attemptEpoch,
      })
      .from(indexingContinuations)
      .where(
        and(
          lte(indexingContinuations.availableAt, now),
          or(
            eq(indexingContinuations.status, "persisted"),
            and(
              eq(indexingContinuations.status, "dispatched"),
              or(
                lte(indexingContinuations.lastDispatchedAt, staleDispatchBefore),
                sql`${indexingContinuations.lastDispatchedAt} is null`,
              ),
            ),
          ),
          or(
            lte(indexingContinuations.dispatchLeaseExpiresAt, now),
            sql`${indexingContinuations.dispatchLeaseExpiresAt} is null`,
          ),
        ),
      )
      .orderBy(indexingContinuations.persistedAt)
      .limit(Math.min(Math.max(input.limit ?? 25, 1), 100))
      .all(),
    leased: IndexingQueueMessage[] = [];
  for (const candidate of candidates) {
    const row = await db
      .update(indexingContinuations)
      .set({
        dispatchLeaseOwner: input.leaseOwner,
        dispatchLeaseExpiresAt: leaseExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingContinuations.id, candidate.id),
          inArray(indexingContinuations.status, ["persisted", "dispatched"]),
          or(
            lte(indexingContinuations.dispatchLeaseExpiresAt, now),
            sql`${indexingContinuations.dispatchLeaseExpiresAt} is null`,
          ),
        ),
      )
      .returning({ id: indexingContinuations.id })
      .get();
    if (row)
      leased.push(
        continuationMessage({
          jobId: candidate.jobId,
          continuationId: candidate.id,
          sequence: candidate.sequence,
          attemptEpoch: candidate.attemptEpoch,
          requestedAt: now,
        }),
      );
  }
  return leased;
}

export async function markQueueContinuationDispatched(input: {
  message: IndexingQueueMessage;
  leaseOwner?: string;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    row = await db
      .update(indexingContinuations)
      .set({
        status: "dispatched",
        dispatchedAt: sql`coalesce(${indexingContinuations.dispatchedAt}, ${now})`,
        lastDispatchedAt: now,
        dispatchCount: sql`${indexingContinuations.dispatchCount} + 1`,
        dispatchLeaseOwner: null,
        dispatchLeaseExpiresAt: null,
        errorCode: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingContinuations.id, input.message.continuationId),
          eq(indexingContinuations.jobId, input.message.jobId),
          eq(indexingContinuations.sequence, input.message.sequence),
          eq(indexingContinuations.attemptEpoch, input.message.attemptEpoch),
          inArray(indexingContinuations.status, ["persisted", "dispatched"]),
          input.leaseOwner
            ? eq(indexingContinuations.dispatchLeaseOwner, input.leaseOwner)
            : undefined,
        ),
      )
      .returning({ id: indexingContinuations.id })
      .get();
  if (row)
    logIndexingEvent("queue_dispatch_acknowledged", {
      jobId: input.message.jobId,
      continuationId: input.message.continuationId,
    });
  return Boolean(row);
}

export async function releaseQueueDispatchLease(input: {
  message: IndexingQueueMessage;
  leaseOwner: string;
  errorCode: string;
  retryAfterMs?: number;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    availableAt = new Date(
      Date.now() + (input.retryAfterMs ?? 30_000),
    ).toISOString();
  await db
    .update(indexingContinuations)
    .set({
      dispatchLeaseOwner: null,
      dispatchLeaseExpiresAt: null,
      availableAt,
      errorCode: input.errorCode,
      updatedAt: now,
    })
    .where(
      and(
        eq(indexingContinuations.id, input.message.continuationId),
        eq(indexingContinuations.jobId, input.message.jobId),
        eq(indexingContinuations.dispatchLeaseOwner, input.leaseOwner),
      ),
    );
}

export async function claimQueueContinuationExecution(input: {
  message: IndexingQueueMessage;
  leaseOwner: string;
  leaseMs?: number;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    leaseExpiresAt = new Date(
      Date.now() + (input.leaseMs ?? 15 * 60_000),
    ).toISOString(),
    row = await db
      .update(indexingContinuations)
      .set({
        status: "worker_started",
        acknowledgedAt: sql`coalesce(${indexingContinuations.acknowledgedAt}, ${now})`,
        workerStartedAt: sql`coalesce(${indexingContinuations.workerStartedAt}, ${now})`,
        executionLeaseOwner: input.leaseOwner,
        executionLeaseExpiresAt: leaseExpiresAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingContinuations.id, input.message.continuationId),
          eq(indexingContinuations.jobId, input.message.jobId),
          eq(indexingContinuations.sequence, input.message.sequence),
          eq(indexingContinuations.attemptEpoch, input.message.attemptEpoch),
          or(
            inArray(indexingContinuations.status, [
              "persisted",
              "dispatched",
              "acknowledged",
            ]),
            and(
              eq(indexingContinuations.status, "worker_started"),
              lte(indexingContinuations.executionLeaseExpiresAt, now),
            ),
          ),
        ),
      )
      .returning({ id: indexingContinuations.id })
      .get();
  if (row)
    logIndexingEvent("queue_worker_started", {
      jobId: input.message.jobId,
      continuationId: input.message.continuationId,
    });
  return Boolean(row);
}

export async function continuationTerminalResult(
  message: IndexingQueueMessage,
) {
  const db = await getDb();
  return db
    .select({
      status: indexingContinuations.status,
      errorCode: indexingContinuations.errorCode,
    })
    .from(indexingContinuations)
    .where(
      and(
        eq(indexingContinuations.id, message.continuationId),
        eq(indexingContinuations.jobId, message.jobId),
      ),
    )
    .get();
}

export async function failQueueContinuationPermanently(input: {
  message: IndexingQueueMessage;
  errorCode?: string;
}) {
  const errorCode = input.errorCode ?? "QUEUE_DELIVERY_EXHAUSTED",
    db = await getDb(),
    now = new Date().toISOString();
  const failed = await db
    .update(indexingContinuations)
    .set({
      status: "failed",
      failedAt: now,
      errorCode,
      dispatchLeaseOwner: null,
      dispatchLeaseExpiresAt: null,
      executionLeaseOwner: null,
      executionLeaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(indexingContinuations.id, input.message.continuationId),
        eq(indexingContinuations.jobId, input.message.jobId),
        inArray(indexingContinuations.status, [
          "persisted",
          "dispatched",
          "acknowledged",
          "worker_started",
        ]),
      ),
    )
    .returning({ id: indexingContinuations.id })
    .get();
  if (!failed) return false;
  await failJob(input.message.jobId, null, errorCode, false);
  logIndexingEvent("queue_dead_lettered", {
    jobId: input.message.jobId,
    continuationId: input.message.continuationId,
    errorCode,
  });
  return true;
}

export async function markContinuationDispatched(
  jobId: string,
  continuationToken: string,
  continuationId: string,
) {
  if (!(await continuationTokenMatches(jobId, continuationToken))) return false;
  return transitionContinuation(jobId, continuationId, "persisted", {
    status: "dispatched",
    dispatchedAt: new Date().toISOString(),
  }, "continuation_dispatched");
}

export async function acknowledgeContinuation(
  jobId: string,
  continuationToken: string,
  continuationId: string,
) {
  if (!(await continuationTokenMatches(jobId, continuationToken))) return false;
  const now = new Date().toISOString();
  return transitionContinuation(jobId, continuationId, "dispatched", {
    status: "acknowledged",
    acknowledgedAt: now,
  }, "continuation_acknowledged");
}

async function continuationTokenMatches(jobId: string, token: string) {
  const db = await getDb(), tokenHash = await sha256(token);
  const row = await db
    .select({ id: indexingJobs.id })
    .from(indexingJobs)
    .where(
      and(
        eq(indexingJobs.id, jobId),
        eq(indexingJobs.continuationTokenHash, tokenHash),
      ),
    )
    .get();
  return Boolean(row);
}

/**
 * Claims execution of a continuation and returns the lease owner that fences
 * this hop's writes. The poll-driven path used to leave `executionLeaseOwner`
 * null, so a lease-expired zombie hop's late commit could not be told apart
 * from the live one and silently overwrote job counters.
 */
export async function markContinuationWorkerStarted(
  jobId: string,
  continuationId: string,
  leaseMs = 15 * 60_000,
) {
  const now = new Date().toISOString(),
    leaseOwner = `exec_${crypto.randomUUID()}`,
    started = await transitionContinuation(
      jobId,
      continuationId,
      "acknowledged",
      {
        status: "worker_started",
        workerStartedAt: now,
        executionLeaseOwner: leaseOwner,
        executionLeaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
      },
      "continuation_worker_started",
    );
  return started ? leaseOwner : null;
}

export async function failContinuation(
  jobId: string,
  continuationId: string,
  errorCode = "CONTINUATION_SCHEDULING_FAILED",
) {
  const db = await getDb(), now = new Date().toISOString();
  await db
    .update(indexingContinuations)
    .set({ status: "failed", failedAt: now, errorCode })
    .where(
      and(
        eq(indexingContinuations.id, continuationId),
        eq(indexingContinuations.jobId, jobId),
        inArray(indexingContinuations.status, [
          "persisted",
          "dispatched",
          "acknowledged",
        ]),
      ),
    );
  logIndexingEvent("continuation_failed", { jobId, continuationId, errorCode });
}

async function transitionContinuation(
  jobId: string,
  continuationId: string,
  expectedStatus: "persisted" | "dispatched" | "acknowledged",
  values: Partial<typeof indexingContinuations.$inferInsert>,
  event:
    | "continuation_dispatched"
    | "continuation_acknowledged"
    | "continuation_worker_started",
) {
  const db = await getDb();
  const row = await db
    .update(indexingContinuations)
    .set(values)
    .where(
      and(
        eq(indexingContinuations.id, continuationId),
        eq(indexingContinuations.jobId, jobId),
        eq(indexingContinuations.status, expectedStatus),
      ),
    )
    .returning({ id: indexingContinuations.id })
    .get();
  if (row) logIndexingEvent(event, { jobId, continuationId });
  return Boolean(row);
}

export async function failIndexingJobScheduling(
  jobId: string,
  continuationToken: string,
) {
  const db = await getDb(),
    tokenHash = await sha256(continuationToken),
    now = new Date().toISOString(),
    failed = await db
      .update(indexingJobs)
      .set({
        status: "failed",
        stage: "failed",
        discoveryStatus: sql`case when ${indexingJobs.discoveryStatus} = 'complete' then 'complete' else 'failed' end`,
        lastErrorCode: "CONTINUATION_SCHEDULING_FAILED",
        terminalReason: "CONTINUATION_SCHEDULING_FAILED",
        completedAt: now,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingJobs.id, jobId),
          eq(indexingJobs.continuationTokenHash, tokenHash),
          inArray(indexingJobs.status, ["queued", "running", "stale"]),
        ),
      )
      .returning({
        workspaceId: indexingJobs.workspaceId,
        connectorId: indexingJobs.connectorId,
      })
      .get();
  if (!failed) return false;
  await db
    .update(indexingJobAttempts)
    .set({
      status: "failed",
      completedAt: now,
      heartbeatAt: now,
      errorCode: "CONTINUATION_SCHEDULING_FAILED",
    })
    .where(
      and(
        eq(indexingJobAttempts.jobId, jobId),
        eq(indexingJobAttempts.status, "running"),
      ),
    );
  logIndexingEvent("scheduling_failure", {
    workspaceId: failed.workspaceId,
    connectorId: failed.connectorId,
    jobId,
    errorCode: "CONTINUATION_SCHEDULING_FAILED",
    stage: "failed",
  });
  return true;
}

export async function indexingJobForWorkspace(
  workspaceId: string,
  jobId: string,
) {
  const db = await getDb();
  return db
    .select({
      id: indexingJobs.id,
      workspaceId: indexingJobs.workspaceId,
      connectorId: indexingJobs.connectorId,
      status: indexingJobs.status,
      stage: indexingJobs.stage,
      discoveryStatus: indexingJobs.discoveryStatus,
      processedCount: indexingJobs.processedCount,
      discoveredCount: indexingJobs.discoveredCount,
      indexedCount: indexingJobs.indexedCount,
      unsupportedCount: indexingJobs.unsupportedCount,
      skippedCount: indexingJobs.skippedCount,
      inaccessibleCount: indexingJobs.inaccessibleCount,
      failedCount: indexingJobs.failedCount,
      structuralCount: indexingJobs.structuralCount,
      fallbackCount: indexingJobs.fallbackCount,
      metadataIndexedCount: indexingJobs.metadataIndexedCount,
      contentIndexedCount: indexingJobs.contentIndexedCount,
      unchangedCount: indexingJobs.unchangedCount,
      duplicateCount: indexingJobs.duplicateCount,
      retriedCount: indexingJobs.retriedCount,
      oversizedCount: indexingJobs.oversizedCount,
      retryCount: indexingJobs.retryCount,
      continuationCount: indexingJobs.continuationCount,
      terminalReason: indexingJobs.terminalReason,
      lastErrorCode: indexingJobs.lastErrorCode,
      startedAt: indexingJobs.startedAt,
      heartbeatAt: indexingJobs.heartbeatAt,
      completedAt: indexingJobs.completedAt,
      createdAt: indexingJobs.createdAt,
      updatedAt: indexingJobs.updatedAt,
    })
    .from(indexingJobs)
    .where(
      and(
        eq(indexingJobs.id, jobId),
        eq(indexingJobs.workspaceId, workspaceId),
      ),
    )
    .get();
}

export async function runIndexingJob(
  jobId: string,
  continuationToken: string,
  continuationId: string,
  options: { queueClaimed?: boolean; executionLeaseOwner?: string } = {},
) {
  const db = await getDb(),
    tokenHash = await sha256(continuationToken),
    now = new Date().toISOString(),
    claimed = await db
      .update(indexingJobs)
      .set({
        status: "running",
        stage: "connecting",
        startedAt: sql`coalesce(${indexingJobs.startedAt}, ${now})`,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingJobs.id, jobId),
          options.queueClaimed
            ? undefined
            : eq(indexingJobs.continuationTokenHash, tokenHash),
          inArray(indexingJobs.status, [...resumable]),
        ),
      )
      .returning()
      .get();
  if (!claimed) return null;
  const executionLeaseOwner = options.queueClaimed
    ? (options.executionLeaseOwner ?? null)
    : await markContinuationWorkerStarted(jobId, continuationId);
  if (!options.queueClaimed && !executionLeaseOwner) {
    await failJob(
      jobId,
      null,
      "CONTINUATION_ACKNOWLEDGEMENT_MISSING",
      false,
    );
    return {
      jobId,
      status: "failed",
      continuationNeeded: false,
      continuationId: null,
      continuationSequence: null,
      attemptEpoch: null,
    };
  }
  // Fence for every write this hop commits: the continuation must still be the
  // one we are executing, still `worker_started`, and still owned by us. A
  // lease-expired zombie hop's late commit becomes a clean no-op instead of
  // overwriting counters and forking the continuation chain.
  const executionFence = continuationExecutionFence({
    jobId,
    continuationId,
    leaseOwner: executionLeaseOwner,
  });
  const currentContinuation = await db
    .select({ sequence: indexingContinuations.sequence })
    .from(indexingContinuations)
    .where(
      and(
        eq(indexingContinuations.id, continuationId),
        eq(indexingContinuations.jobId, jobId),
      ),
    )
    .get();
  let attemptId: string | null = null;
  try {
    const persistedAttempt = await db
        .select({ value: max(indexingJobAttempts.attemptNumber) })
        .from(indexingJobAttempts)
        .where(eq(indexingJobAttempts.jobId, jobId))
        .get(),
      attemptNumber = nextIndexingAttemptNumber(
        claimed.continuationCount,
        persistedAttempt?.value,
      ),
      candidateAttemptId = `attempt_${jobId}_${attemptNumber}`;
    const insertedAttempt = await db.insert(indexingJobAttempts).values({
      id: candidateAttemptId,
      jobId,
      attemptNumber,
      status: "running",
      startedAt: now,
      heartbeatAt: now,
    }).onConflictDoNothing().returning({ id: indexingJobAttempts.id }).get();
    if (!insertedAttempt) throw new Error("INDEXING_ATTEMPT_PERSISTENCE_COLLISION");
    attemptId = candidateAttemptId;
    logIndexingEvent("attempt_created", {
      workspaceId: claimed.workspaceId,
      connectorId: claimed.connectorId,
      jobId,
      attemptNumber,
      stage: "connecting",
    });
    const connector = await db
      .select()
      .from(connectors)
      .where(
        and(
          eq(connectors.id, claimed.connectorId),
          eq(connectors.workspaceId, claimed.workspaceId),
        ),
      )
      .get();
    if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
    if (connector.status === "reauthorization_required")
      throw new Error("GOOGLE_REAUTHORIZATION_REQUIRED");
    const result = await synchronizeGoogleDrive(connector, async (progress) => {
        const heartbeat = new Date().toISOString();
        // In-hop heartbeats may only RAISE a counter. Writing the hop-local
        // value directly made every counter sawtooth to 0 at the start of each
        // continuation (9,500 -> 0 -> 9,700) for the whole job; the
        // end-of-hop write below is the authoritative absolute value.
        await db
          .update(indexingJobs)
          .set({
            stage: progress.stage,
            discoveryStatus: progress.discoveryStatus,
            processedCount: monotonic(
              indexingJobs.processedCount,
              progress.filesProcessed,
            ),
            discoveredCount: monotonic(
              indexingJobs.discoveredCount,
              progress.filesDiscovered,
            ),
            indexedCount: monotonic(
              indexingJobs.indexedCount,
              progress.filesIndexed,
            ),
            unsupportedCount: monotonic(
              indexingJobs.unsupportedCount,
              progress.filesUnsupported,
            ),
            skippedCount: monotonic(
              indexingJobs.skippedCount,
              progress.filesUnsupported,
            ),
            inaccessibleCount: monotonic(
              indexingJobs.inaccessibleCount,
              progress.filesInaccessible,
            ),
            failedCount: monotonic(
              indexingJobs.failedCount,
              progress.filesFailed,
            ),
            structuralCount: monotonic(
              indexingJobs.structuralCount,
              progress.structuredFiles,
            ),
            fallbackCount: monotonic(
              indexingJobs.fallbackCount,
              progress.fallbackFiles,
            ),
            metadataIndexedCount: monotonic(
              indexingJobs.metadataIndexedCount,
              progress.filesMetadataIndexed,
            ),
            contentIndexedCount: monotonic(
              indexingJobs.contentIndexedCount,
              progress.filesIndexed,
            ),
            unchangedCount: monotonic(
              indexingJobs.unchangedCount,
              progress.filesUnchanged,
            ),
            duplicateCount: monotonic(
              indexingJobs.duplicateCount,
              progress.filesDuplicate,
            ),
            oversizedCount: monotonic(
              indexingJobs.oversizedCount,
              progress.filesOversized,
            ),
            // retriedCount accumulates across hops at continuation completion
            heartbeatAt: heartbeat,
            updatedAt: heartbeat,
          })
          .where(eq(indexingJobs.id, jobId));
        await db
          .update(indexingJobAttempts)
          .set({ heartbeatAt: heartbeat })
          .where(eq(indexingJobAttempts.id, candidateAttemptId));
        logIndexingEvent("heartbeat_updated", {
          workspaceId: claimed.workspaceId,
          connectorId: claimed.connectorId,
          jobId,
          discoveredCount: progress.filesDiscovered,
          processedCount: progress.filesProcessed,
          indexedCount: progress.filesIndexed,
          skippedCount: progress.filesUnsupported,
          failedCount: progress.filesFailed,
          stage: progress.stage,
        });
        },
        {
          discoveryOnly: claimed.discoveryStatus !== "complete",
          // Resume Drive pagination at the durable cursor whenever discovery
          // has already started but not finished.
          resumeDiscovery: claimed.discoveryStatus === "running",
          runStartedAt: claimed.startedAt ?? claimed.createdAt,
        },
      ),
      finishedAt = new Date().toISOString(),
      unsupportedCount = result.filesUnsupported,
      continuationNeeded =
        result.continuationNeeded ||
        result.filesProcessed < result.filesDiscovered,
      status = continuationNeeded
        ? "queued"
        : result.status === "complete"
          ? "completed"
          : result.status;
    // Derived from THIS continuation's sequence, never from the current max:
    // a zombie hop then computes the same next id and its insert conflicts
    // away instead of forking a second continuation chain.
    const persistedContinuation = continuationNeeded
        ? await db
            .select({ value: max(indexingContinuations.sequence) })
            .from(indexingContinuations)
            .where(eq(indexingContinuations.jobId, jobId))
            .get()
        : null,
      nextContinuationSequence = continuationNeeded
        ? (currentContinuation?.sequence ??
            Math.max(
              attemptNumber,
              claimed.continuationCount,
              persistedContinuation?.value ?? 0,
            )) + 1
        : null,
      nextContinuationId = nextContinuationSequence
        ? continuationDispatchId(jobId, nextContinuationSequence)
        : null;
    // Only the hop that still owns the execution lease may commit.
    const fencedJobIds = db
      .select({ jobId: indexingContinuations.jobId })
      .from(indexingContinuations)
      .where(executionFence);
    const updateJob = db.update(indexingJobs).set({
        status,
        stage: continuationNeeded
          ? "indexing"
          : status === "completed"
            ? "completed"
            : "failed",
        // A budget- or deadline-limited discovery checkpoint is still running
        // discovery, not failed: the next hop resumes at the saved cursor.
        discoveryStatus: result.paginationComplete
          ? "complete"
          : continuationNeeded
            ? "running"
            : "failed",
        // Absolute end-of-hop truth, but still only upward: a hop that only
        // checkpointed discovery never held the inventory, so its zeros must
        // not erase what earlier hops of this job already accounted for.
        processedCount: monotonic(
          indexingJobs.processedCount,
          result.filesProcessed,
        ),
        discoveredCount: monotonic(
          indexingJobs.discoveredCount,
          result.filesDiscovered,
        ),
        indexedCount: monotonic(indexingJobs.indexedCount, result.filesIndexed),
        unsupportedCount: monotonic(
          indexingJobs.unsupportedCount,
          unsupportedCount,
        ),
        skippedCount: monotonic(indexingJobs.skippedCount, unsupportedCount),
        inaccessibleCount: monotonic(
          indexingJobs.inaccessibleCount,
          result.filesRemoved,
        ),
        // Failures legitimately fall when a retry succeeds, so this one is
        // absolute — but only when the hop actually planned the inventory.
        failedCount: result.plannedInventory
          ? result.filesFailed
          : monotonic(indexingJobs.failedCount, result.filesFailed),
        structuralCount: monotonic(
          indexingJobs.structuralCount,
          result.structuredFiles,
        ),
        fallbackCount: monotonic(
          indexingJobs.fallbackCount,
          result.fallbackFiles,
        ),
        metadataIndexedCount: monotonic(
          indexingJobs.metadataIndexedCount,
          result.filesMetadataIndexed,
        ),
        // Only files the DB actually persisted as `indexed`.
        contentIndexedCount: monotonic(
          indexingJobs.contentIndexedCount,
          result.filesIndexed,
        ),
        unchangedCount: monotonic(
          indexingJobs.unchangedCount,
          result.filesUnchanged,
        ),
        // Duplicates and retries are per-hop events: they accumulate across
        // continuations instead of being overwritten by the next hop's 0.
        // The execution fence makes each accumulation happen exactly once.
        duplicateCount: accumulatedCounter(
          indexingJobs.duplicateCount,
          result.filesDuplicate,
        ),
        retriedCount: accumulatedCounter(
          indexingJobs.retriedCount,
          result.filesRetried,
        ),
        oversizedCount: accumulatedCounter(
          indexingJobs.oversizedCount,
          result.filesOversized,
        ),
        continuationCount: attemptNumber,
        heartbeatAt: finishedAt,
        completedAt: continuationNeeded ? null : finishedAt,
        terminalReason: continuationNeeded
          ? null
          : result.status === "complete"
            ? "INVENTORY_COMPLETE"
            : "COMPLETED_WITH_FAILURES",
        lastErrorCode: continuationNeeded
          ? result.continuationNeeded
            ? "SYNC_TIME_BUDGET_REACHED"
            : "INDEXING_INVENTORY_UNACCOUNTED"
          : result.status === "partial"
            ? "SYNC_PARTIAL"
            : null,
        updatedAt: finishedAt,
      }).where(and(eq(indexingJobs.id, jobId), inArray(indexingJobs.id, fencedJobIds)));
    const updateAttempt = db.update(indexingJobAttempts)
        .set({ status: "completed", completedAt: finishedAt, heartbeatAt: finishedAt })
        .where(
          and(
            eq(indexingJobAttempts.id, candidateAttemptId),
            eq(indexingJobAttempts.status, "running"),
          ),
        );
    const completeContinuation = db.update(indexingContinuations)
        .set({
          status: "completed",
          completedAt: finishedAt,
          // Persisted hop stats: files/min rates derive from deltas between
          // these snapshots on trailing completed continuations.
          processedCountAtCompletion: result.filesProcessed,
        })
        .where(executionFence);
    if (nextContinuationId) {
      const persistNext = db.insert(indexingContinuations).values({
          id: nextContinuationId,
          jobId,
          sequence: nextContinuationSequence!,
          attemptEpoch: claimed.retryCount + 1,
          status: "persisted",
          persistedAt: finishedAt,
          availableAt: finishedAt,
          updatedAt: finishedAt,
        }).onConflictDoNothing();
      // completeContinuation runs last: it invalidates the fence the earlier
      // statements in this batch are guarded by.
      await db.batch([
        updateJob,
        updateAttempt,
        persistNext,
        completeContinuation,
      ]);
    } else
      await db.batch([updateJob, updateAttempt, completeContinuation]);
    logIndexingEvent("continuation_completed", {
      workspaceId: claimed.workspaceId,
      connectorId: claimed.connectorId,
      jobId,
      continuationId,
      stage: status,
    });
    if (nextContinuationId)
      logIndexingEvent("continuation_persisted", {
        workspaceId: claimed.workspaceId,
        connectorId: claimed.connectorId,
        jobId,
        continuationId: nextContinuationId,
        stage: "indexing",
      });
    if (!continuationNeeded) {
      await refreshWorkspaceConflicts(claimed.workspaceId, await indexedWorkspaceFiles(claimed.workspaceId));
      // The receipt reports the PERSISTED job counters, not the last hop's
      // in-memory view — accumulated counters (duplicates, retries, oversized)
      // only exist in the row, and the last hop always sees 0 of them.
      const persisted = await indexingJobForWorkspace(
        claimed.workspaceId,
        jobId,
      );
      await persistCoverageReceipt({
        job: claimed,
        runId: result.runId,
        status,
        inventoryComplete: result.paginationComplete,
        counts: {
          discovered: persisted?.discoveredCount ?? result.filesDiscovered,
          processed: persisted?.processedCount ?? result.filesProcessed,
          indexed: persisted?.indexedCount ?? result.filesIndexed,
          unsupported: persisted?.unsupportedCount ?? unsupportedCount,
          failed: persisted?.failedCount ?? result.filesFailed,
          structural: persisted?.structuralCount ?? result.structuredFiles,
          fallback: persisted?.fallbackCount ?? result.fallbackFiles,
          added: result.filesAdded,
          updated: result.filesUpdated,
          unchanged: persisted?.unchangedCount ?? result.filesUnchanged,
          deleted: result.filesRemoved,
          metadataIndexed:
            persisted?.metadataIndexedCount ?? result.filesMetadataIndexed,
          contentIndexed:
            persisted?.contentIndexedCount ?? result.filesIndexed,
          duplicate: persisted?.duplicateCount ?? result.filesDuplicate,
          retried: persisted?.retriedCount ?? result.filesRetried,
          oversized: persisted?.oversizedCount ?? result.filesOversized,
        },
        finishedAt,
      });
      logIndexingEvent("job_completed", {
        workspaceId: claimed.workspaceId,
        connectorId: claimed.connectorId,
        jobId,
        discoveredCount: result.filesDiscovered,
        processedCount: result.filesProcessed,
        indexedCount: result.filesIndexed,
        skippedCount: unsupportedCount,
        failedCount: result.filesFailed,
        stage: status === "completed" ? "completed" : "failed",
      });
    }
    return {
      jobId,
      status,
      continuationNeeded,
      continuationId: nextContinuationId,
      continuationSequence: nextContinuationSequence,
      attemptEpoch: claimed.retryCount + 1,
    };
  } catch (error) {
    const code = attemptId
        ? sanitizedErrorCode(error)
        : "INDEXING_ATTEMPT_PERSISTENCE_FAILED",
      reauthorization = code.includes("REAUTHORIZATION") || code.includes("INVALID_GRANT");
    await failJob(jobId, attemptId, code, reauthorization);
    await failContinuation(jobId, continuationId, code);
    return {
      jobId,
      status: reauthorization ? "reauthorization_required" : "failed",
      continuationNeeded: false,
      continuationId: null,
      continuationSequence: null,
      attemptEpoch: null,
    };
  }
}

function continuationDispatchId(jobId: string, sequence: number) {
  return `continuation_${jobId}_${sequence}`;
}

async function failJob(
  jobId: string,
  attemptId: string | null,
  errorCode: string,
  reauthorization: boolean,
) {
  const db = await getDb(), now = new Date().toISOString();
  await db
    .update(indexingJobs)
    .set({
      status: reauthorization ? "reauthorization_required" : "failed",
      stage: "failed",
      discoveryStatus: sql`case when ${indexingJobs.discoveryStatus} = 'complete' then 'complete' else 'failed' end`,
      lastErrorCode: errorCode,
      terminalReason: errorCode,
      completedAt: now,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(indexingJobs.id, jobId));
  if (attemptId)
    await db
      .update(indexingJobAttempts)
      .set({ status: "failed", errorCode, completedAt: now, heartbeatAt: now })
      .where(eq(indexingJobAttempts.id, attemptId));
  logIndexingEvent("job_failed", {
    jobId,
    errorCode,
    stage: "failed",
  });
}

async function persistCoverageReceipt(input: {
  job: typeof indexingJobs.$inferSelect;
  runId: string;
  status: string;
  inventoryComplete: boolean;
  counts: Record<string, number>;
  finishedAt: string;
}) {
  const db = await getDb();
  await db
    .insert(coverageReceipts)
    .values({
      id: `coverage_${crypto.randomUUID()}`,
      workspaceId: input.job.workspaceId,
      connectorId: input.job.connectorId,
      runId: input.runId,
      jobId: input.job.id,
      status: input.status,
      inventoryComplete: input.inventoryComplete,
      countsJson: JSON.stringify(input.counts),
      extractionVersion: EXTRACTION_VERSION,
      indexingVersion: INDEXING_VERSION,
      deploymentVersion: input.job.deploymentVersion,
      startedAt: input.job.startedAt ?? input.job.createdAt,
      finishedAt: input.finishedAt,
      createdAt: input.finishedAt,
    })
    .onConflictDoNothing();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizedErrorCode(error: unknown) {
  return (error instanceof Error ? error.message : "UNKNOWN_ERROR")
    .replace(/[^A-Z0-9_()-]/gi, "_")
    .slice(0, 100);
}
