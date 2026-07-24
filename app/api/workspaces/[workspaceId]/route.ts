import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { workspaceDashboard } from "@/lib/workspaces/repository";
import { enqueueIndexingJob } from "@/lib/indexing/jobs";
import { isIndexingJobStale } from "@/lib/indexing/job-lifecycle";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  try {
    const { workspaceId } = await params,
      dashboard = await workspaceDashboard(actor.actorId, workspaceId);
    if (!dashboard)
      return NextResponse.json(
        { error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } },
        { status: 404 },
      );
    const headers: Record<string, string> = { "cache-control": "no-store" },
      job = dashboard.indexingJob;
    if (
      !dashboard.demoMode &&
      dashboard.connector &&
      job &&
      ["queued", "running", "pausing", "stale"].includes(job.status) &&
      isIndexingJobStale(job.heartbeatAt)
    ) {
      const resumed = await enqueueIndexingJob({
        workspaceId,
        connectorId: dashboard.connector.id,
        actorId: actor.actorId,
      });
      if (
        resumed.continuationId &&
        resumed.continuationSequence &&
        resumed.attemptEpoch
      ) {
        headers["x-find-anything-job-id"] = resumed.jobId;
        headers["x-find-anything-continuation-id"] = resumed.continuationId;
        headers["x-find-anything-continuation-sequence"] =
          String(resumed.continuationSequence);
        headers["x-find-anything-attempt-epoch"] =
          String(resumed.attemptEpoch);
      }
    }
    return NextResponse.json(dashboard, { headers });
  } catch {
    return NextResponse.json(
      { error: { code: "DATABASE_UNAVAILABLE", message: "Workspace storage is not configured." } },
      { status: 503 },
    );
  }
}
