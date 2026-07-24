import { and, desc, eq, inArray, lte, max, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
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

export async function markContinuationWorkerStarted(
  jobId: string,
  continuationId: string,
) {
  const now = new Date().toISOString();
  return transitionContinuation(jobId, continuationId, "acknowledged", {
    status: "worker_started",
    workerStartedAt: now,
  }, "continuation_worker_started");
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
  options: { queueClaimed?: boolean } = {},
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
  const workerStarted = options.queueClaimed
    ? true
    : await markContinuationWorkerStarted(jobId, continuationId);
  if (!workerStarted) {
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
    };
  }
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
        await db
          .update(indexingJobs)
          .set({
            stage: progress.stage,
            discoveryStatus: progress.discoveryStatus,
            processedCount: progress.filesProcessed,
            discoveredCount: progress.filesDiscovered,
            indexedCount: progress.filesIndexed,
            unsupportedCount: progress.filesUnsupported,
            skippedCount: progress.filesUnsupported,
            inaccessibleCount: progress.filesInaccessible,
            failedCount: progress.filesFailed,
            structuralCount: progress.structuredFiles,
            fallbackCount: progress.fallbackFiles,
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
      }, { discoveryOnly: claimed.discoveryStatus !== "complete" }),
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
    const persistedContinuation = continuationNeeded
        ? await db
            .select({ value: max(indexingContinuations.sequence) })
            .from(indexingContinuations)
            .where(eq(indexingContinuations.jobId, jobId))
            .get()
        : null,
      nextContinuationSequence = continuationNeeded
        ? Math.max(
            attemptNumber,
            claimed.continuationCount,
            persistedContinuation?.value ?? 0,
          ) + 1
        : null,
      nextContinuationId = nextContinuationSequence
        ? continuationDispatchId(jobId, nextContinuationSequence)
        : null;
    const updateJob = db.update(indexingJobs).set({
        status,
        stage: continuationNeeded
          ? "indexing"
          : status === "completed"
            ? "completed"
            : "failed",
        discoveryStatus: result.paginationComplete ? "complete" : "failed",
        processedCount: result.filesProcessed,
        discoveredCount: result.filesDiscovered,
        indexedCount: result.filesIndexed,
        unsupportedCount,
        skippedCount: unsupportedCount,
        inaccessibleCount: result.filesRemoved,
        failedCount: result.filesFailed,
        structuralCount: result.structuredFiles,
        fallbackCount: result.fallbackFiles,
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
      }).where(eq(indexingJobs.id, jobId));
    const updateAttempt = db.update(indexingJobAttempts)
        .set({ status: "completed", completedAt: finishedAt, heartbeatAt: finishedAt })
        .where(eq(indexingJobAttempts.id, candidateAttemptId));
    const completeContinuation = db.update(indexingContinuations)
        .set({ status: "completed", completedAt: finishedAt })
        .where(
          and(
            eq(indexingContinuations.id, continuationId),
            eq(indexingContinuations.jobId, jobId),
            eq(indexingContinuations.status, "worker_started"),
          ),
        );
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
      await db.batch([
        updateJob,
        updateAttempt,
        completeContinuation,
        persistNext,
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
      await persistCoverageReceipt({
        job: claimed,
        runId: result.runId,
        status,
        inventoryComplete: result.paginationComplete,
        counts: {
          discovered: result.filesDiscovered,
          processed: result.filesProcessed,
          indexed: result.filesIndexed,
          unsupported: unsupportedCount,
          failed: result.filesFailed,
          structural: result.structuredFiles,
          fallback: result.fallbackFiles,
          added: result.filesAdded,
          updated: result.filesUpdated,
          unchanged: result.filesUnchanged,
          deleted: result.filesRemoved,
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
