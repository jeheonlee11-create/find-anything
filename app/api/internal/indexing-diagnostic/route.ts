import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { indexingJobAttempts, indexingJobs } from "@/db/schema";
import { requireBetaAdmin } from "@/lib/beta/admin";

const APPROVED_JOB_ID = "job_11bc13ea-567e-4ef7-b0df-bbcb04b68c39";
const APPROVED_WORKSPACE_ID = "ws_9b615077-699e-4b36-8849-0e3fe5341edb";

export async function GET(request: Request) {
  const admin = await requireBetaAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const url = new URL(request.url),
    jobId = url.searchParams.get("jobId"),
    workspaceId = url.searchParams.get("workspaceId");
  if (jobId !== APPROVED_JOB_ID || workspaceId !== APPROVED_WORKSPACE_ID)
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  const db = await getDb(),
    job = await db
      .select({
        id: indexingJobs.id,
        workspaceId: indexingJobs.workspaceId,
        status: indexingJobs.status,
        processedCount: indexingJobs.processedCount,
        discoveredCount: indexingJobs.discoveredCount,
        indexedCount: indexingJobs.indexedCount,
        unsupportedCount: indexingJobs.unsupportedCount,
        failedCount: indexingJobs.failedCount,
        continuationCount: indexingJobs.continuationCount,
        retryCount: indexingJobs.retryCount,
        heartbeatAt: indexingJobs.heartbeatAt,
        completedAt: indexingJobs.completedAt,
        lastErrorCode: indexingJobs.lastErrorCode,
        updatedAt: indexingJobs.updatedAt,
      })
      .from(indexingJobs)
      .where(and(eq(indexingJobs.id, jobId), eq(indexingJobs.workspaceId, workspaceId)))
      .get(),
    attempts = await db
      .select({
        id: indexingJobAttempts.id,
        attemptNumber: indexingJobAttempts.attemptNumber,
        status: indexingJobAttempts.status,
        startedAt: indexingJobAttempts.startedAt,
        heartbeatAt: indexingJobAttempts.heartbeatAt,
        completedAt: indexingJobAttempts.completedAt,
        errorCode: indexingJobAttempts.errorCode,
      })
      .from(indexingJobAttempts)
      .where(eq(indexingJobAttempts.jobId, jobId))
      .orderBy(asc(indexingJobAttempts.attemptNumber));
  return NextResponse.json({ job, attempts }, { headers: { "cache-control": "no-store" } });
}
