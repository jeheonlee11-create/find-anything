import { NextResponse } from "next/server";
import {
  isAuthFailure,
  isAuthorizationFailure,
  requireAuthenticatedUser,
  requireConnectorAccess,
} from "@/lib/auth/authorization";
import { enqueueIndexingJob } from "@/lib/indexing/jobs";
import { synchronizeGoogleDrive } from "@/lib/google-drive/sync";
import { rateLimit, recordBetaEvent } from "@/lib/beta/repository";
import { logIndexingEvent } from "@/lib/observability/indexing-log";

export async function POST(request: Request) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  if (!(await rateLimit(actor.actorId, "drive_sync", 30, 1800)))
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "An indexing job was recently requested. Check its progress before retrying." } },
      { status: 429 },
    );
  const body = (await request.json().catch(() => null)) as { workspaceId?: unknown } | null,
    workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId)
    return NextResponse.json(
      { error: { code: "WORKSPACE_REQUIRED", message: "Select a workspace before indexing Drive." } },
      { status: 400 },
    );
  const connector = await requireConnectorAccess(actor, workspaceId);
  if (isAuthorizationFailure(connector)) return connector;
  if (["revoked", "reauthorization_required"].includes(connector.status))
    return NextResponse.json(
      { error: { code: "GOOGLE_REAUTHORIZATION_REQUIRED", message: "Reconnect Google Drive before indexing." } },
      { status: 409 },
    );
  try {
    logIndexingEvent("connector_initialized", {
      workspaceId,
      connectorId: connector.id,
      stage: "connecting",
    });
    if (process.env.ENABLE_DURABLE_INDEXING_JOBS === "false") {
      const result = await synchronizeGoogleDrive(connector);
      await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "indexing_completed", properties: { filesIndexed: result.filesIndexed, structuralFiles: result.structuredFiles } });
      return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
    }
    const job = await enqueueIndexingJob({ workspaceId, connectorId: connector.id, actorId: actor.actorId });
    await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "indexing_started", properties: { resumed: job.resumed } });
    const headers: Record<string, string> = { "cache-control": "no-store" };
    if (
      job.continuationId &&
      job.continuationSequence &&
      job.attemptEpoch &&
      job.continuationToken
    ) {
      headers["x-find-anything-job-id"] = job.jobId;
      headers["x-find-anything-job-token"] = job.continuationToken;
      headers["x-find-anything-continuation-id"] = job.continuationId;
      headers["x-find-anything-continuation-sequence"] =
        String(job.continuationSequence);
      headers["x-find-anything-attempt-epoch"] = String(job.attemptEpoch);
    }
    return NextResponse.json(
      {
        jobId: job.jobId,
        status: job.alreadyActive ? "running" : "queued",
        resumed: job.resumed,
        alreadyActive: job.alreadyActive,
        message: job.alreadyActive
          ? "Indexing is already in progress."
          : "Indexing was queued. You may safely close this page.",
      },
      { status: 202, headers },
    );
  } catch {
    await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "indexing_failed" }).catch(() => undefined);
    return NextResponse.json(
      { error: { code: "INDEXING_UNAVAILABLE", message: "Indexing could not start right now. Your saved files are safe; please try again shortly." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
