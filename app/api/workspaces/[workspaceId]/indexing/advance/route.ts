import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { workspaceDashboard } from "@/lib/workspaces/repository";
import {
  enqueueIndexingJob,
  resumePersistedContinuation,
} from "@/lib/indexing/jobs";
import { isIndexingJobStale } from "@/lib/indexing/job-lifecycle";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params,
    dashboard = await workspaceDashboard(actor.actorId, workspaceId),
    job = dashboard?.indexingJob;
  if (
    !dashboard ||
    dashboard.demoMode ||
    !dashboard.connector ||
    !job ||
    !["queued", "running", "pausing", "stale", "partial"].includes(job.status)
  )
    return new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  const resumed = isIndexingJobStale(job.heartbeatAt)
    ? await enqueueIndexingJob({
        workspaceId,
        connectorId: dashboard.connector.id,
        actorId: actor.actorId,
      })
    : await resumePersistedContinuation(job.id);
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (
    resumed?.continuationId &&
    resumed.continuationSequence &&
    resumed.attemptEpoch &&
    resumed.continuationToken
  ) {
    headers["x-find-anything-job-id"] = resumed.jobId;
    headers["x-find-anything-job-token"] = resumed.continuationToken;
    headers["x-find-anything-continuation-id"] = resumed.continuationId;
    headers["x-find-anything-continuation-sequence"] = String(
      resumed.continuationSequence,
    );
    headers["x-find-anything-attempt-epoch"] = String(resumed.attemptEpoch);
  }
  return NextResponse.json({ status: "accepted" }, { status: 202, headers });
}
