import { and, eq, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connectors,
  coverageReceipts,
  indexingJobAttempts,
  indexingJobs,
} from "@/db/schema";
import { synchronizeGoogleDrive } from "@/lib/google-drive/sync";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { refreshWorkspaceConflicts } from "@/lib/conflicts/repository";
import { nextIndexingAttemptNumber } from "@/lib/indexing/job-lifecycle";

export const INDEXING_VERSION = "literal-v1";
export const EXTRACTION_VERSION = "structural-v1";
const resumable = ["queued", "partial", "stale"] as const;
const active = ["queued", "running", "pausing", "stale"] as const;

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
          inArray(indexingJobs.status, [...active]),
        ),
      )
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
    await db
      .update(indexingJobs)
      .set({
        status: "queued",
        continuationTokenHash: tokenHash,
        retryCount: existing.retryCount + 1,
        terminalReason: null,
        lastErrorCode: null,
        updatedAt: now,
      })
      .where(eq(indexingJobs.id, existing.id));
    return { jobId: existing.id, continuationToken: token, resumed: true, alreadyActive: false };
  }
  const jobId = `job_${crypto.randomUUID()}`;
  await db.insert(indexingJobs).values({
    id: jobId,
    workspaceId: input.workspaceId,
    connectorId: input.connectorId,
    requestedByUserId: input.actorId,
    status: "queued",
    continuationTokenHash: tokenHash,
    deploymentVersion: process.env.APP_VERSION ?? "unknown",
    createdAt: now,
    updatedAt: now,
  });
  return { jobId, continuationToken: token, resumed: false, alreadyActive: false };
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
      processedCount: indexingJobs.processedCount,
      discoveredCount: indexingJobs.discoveredCount,
      indexedCount: indexingJobs.indexedCount,
      unsupportedCount: indexingJobs.unsupportedCount,
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

export async function runIndexingJob(jobId: string, continuationToken: string) {
  const db = await getDb(),
    tokenHash = await sha256(continuationToken),
    now = new Date().toISOString(),
    claimed = await db
      .update(indexingJobs)
      .set({
        status: "running",
        startedAt: sql`coalesce(${indexingJobs.startedAt}, ${now})`,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(indexingJobs.id, jobId),
          eq(indexingJobs.continuationTokenHash, tokenHash),
          inArray(indexingJobs.status, [...resumable]),
        ),
      )
      .returning()
      .get();
  if (!claimed) return null;
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
    await db.insert(indexingJobAttempts).values({
      id: candidateAttemptId,
      jobId,
      attemptNumber,
      status: "running",
      startedAt: now,
      heartbeatAt: now,
    });
    attemptId = candidateAttemptId;
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
            processedCount: progress.filesProcessed,
            discoveredCount: progress.filesDiscovered,
            indexedCount: progress.filesIndexed,
            unsupportedCount: progress.filesUnsupported,
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
      }),
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
    await db
      .update(indexingJobs)
      .set({
        status,
        processedCount: result.filesProcessed,
        discoveredCount: result.filesDiscovered,
        indexedCount: result.filesIndexed,
        unsupportedCount,
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
      })
      .where(eq(indexingJobs.id, jobId));
    await db
      .update(indexingJobAttempts)
      .set({ status: "completed", completedAt: finishedAt, heartbeatAt: finishedAt })
      .where(eq(indexingJobAttempts.id, candidateAttemptId));
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
    }
    return { jobId, status, continuationNeeded };
  } catch (error) {
    const code = attemptId
        ? sanitizedErrorCode(error)
        : "INDEXING_ATTEMPT_PERSISTENCE_FAILED",
      reauthorization = code.includes("REAUTHORIZATION") || code.includes("INVALID_GRANT");
    await failJob(jobId, attemptId, code, reauthorization);
    return { jobId, status: reauthorization ? "reauthorization_required" : "failed", continuationNeeded: false };
  }
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
