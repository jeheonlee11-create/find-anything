import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { connectorForActor } from "@/lib/google-drive/repository";
import { synchronizeGoogleDrive } from "@/lib/google-drive/sync";
import { rateLimit, recordBetaEvent } from "@/lib/beta/repository";
export async function POST(request: Request) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  if (!(await rateLimit(actor.actorId, "drive_sync", 6, 600))) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Indexing is limited to six runs every ten minutes. Please wait and retry." } }, { status: 429 });
  const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null,
    workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId)
    return NextResponse.json(
      {
        error: {
          code: "WORKSPACE_REQUIRED",
          message: "Select a workspace before syncing Drive.",
        },
      },
      { status: 400 },
    );
  try {
    const connector = await connectorForActor(actor, workspaceId);
    if (!connector || connector.status === "revoked")
      return NextResponse.json(
        {
          error: {
            code: "GOOGLE_DRIVE_NOT_CONNECTED",
            message: "Connect Google Drive before starting a sync.",
          },
        },
        { status: 409 },
      );
    const result = await synchronizeGoogleDrive(connector);
    await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "indexing_completed", properties: { filesIndexed: result.filesIndexed, structuralFiles: result.structuredFiles } });
    return NextResponse.json(
      { connectorId: connector.id, ...result },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    await recordBetaEvent({ actorId: actor.actorId, event: "indexing_failed" }).catch(() => undefined);
    return NextResponse.json(
      {
        error: {
          code: "GOOGLE_DRIVE_SYNC_FAILED",
          message: "The Drive sync failed. Review connector status and retry.",
        },
        detail:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
