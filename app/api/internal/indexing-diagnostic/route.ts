import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { indexingJobAttempts, indexingJobs } from "@/db/schema";
import { requireBetaAdmin } from "@/lib/beta/admin";

const APPROVED_JOB_ID = "job_c779bbc4-7a61-4a56-abac-57404b538fbd";
const APPROVED_WORKSPACE_ID = "ws_b59e5400-46c0-4732-a90c-27af8781ee0a";

export async function GET(request: Request) {
  const admin = await requireBetaAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const url = new URL(request.url);
  if (
    url.searchParams.get("jobId") !== APPROVED_JOB_ID ||
    url.searchParams.get("workspaceId") !== APPROVED_WORKSPACE_ID
  ) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const db = await getDb();
  const job = await db
    .select({
      id: indexingJobs.id,
      workspaceId: indexingJobs.workspaceId,
      connectorId: indexingJobs.connectorId,
      status: indexingJobs.status,
      processedCount: indexingJobs.processedCount,
      discoveredCount: indexingJobs.discoveredCount,
      indexedCount: indexingJobs.indexedCount,
      retryCount: indexingJobs.retryCount,
      continuationCount: indexingJobs.continuationCount,
      terminalReason: indexingJobs.terminalReason,
      lastErrorCode: indexingJobs.lastErrorCode,
      startedAt: indexingJobs.startedAt,
      heartbeatAt: indexingJobs.heartbeatAt,
      completedAt: indexingJobs.completedAt,
      updatedAt: indexingJobs.updatedAt,
    })
    .from(indexingJobs)
    .where(
      and(
        eq(indexingJobs.id, APPROVED_JOB_ID),
        eq(indexingJobs.workspaceId, APPROVED_WORKSPACE_ID),
      ),
    )
    .get();

  const attempts = await db
    .select({
      id: indexingJobAttempts.id,
      jobId: indexingJobAttempts.jobId,
      attemptNumber: indexingJobAttempts.attemptNumber,
      status: indexingJobAttempts.status,
      startedAt: indexingJobAttempts.startedAt,
      heartbeatAt: indexingJobAttempts.heartbeatAt,
      completedAt: indexingJobAttempts.completedAt,
      errorCode: indexingJobAttempts.errorCode,
    })
    .from(indexingJobAttempts)
    .where(eq(indexingJobAttempts.jobId, APPROVED_JOB_ID))
    .orderBy(asc(indexingJobAttempts.attemptNumber));

  return NextResponse.json(
    { job: job ?? null, attempts },
    { headers: { "cache-control": "no-store" } },
  );
}
