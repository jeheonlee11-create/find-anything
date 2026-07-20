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
