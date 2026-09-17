import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { actorWorkspace } from "@/lib/workspaces/repository";
import { connectorForActor } from "@/lib/google-drive/repository";
import { usableAccessToken } from "@/lib/google-drive/sync";

/**
 * Hands the browser exactly what Google's picker needs and nothing more: a
 * short-lived access token scoped to per-file Drive access, plus the public
 * picker key and project number. The refresh token never leaves the server.
 * Granting happens entirely on Google's side when the user picks files; the
 * next sync sees the enlarged corpus through files.list, so no file IDs need
 * to be registered here.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params;
  if (!(await actorWorkspace(actor.actorId, workspaceId)))
    return NextResponse.json(
      { error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } },
      { status: 404 },
    );
  const pickerApiKey = process.env.GOOGLE_PICKER_API_KEY,
    pickerAppId = process.env.GOOGLE_PROJECT_NUMBER;
  if (!pickerApiKey || !pickerAppId)
    return NextResponse.json(
      {
        error: {
          code: "PICKER_NOT_CONFIGURED",
          message:
            "File picking is not configured yet. Ask the founder to enable the Google Picker API.",
        },
      },
      { status: 503 },
    );
  const connector = await connectorForActor(actor, workspaceId);
  if (!connector || ["revoked", "reauthorization_required"].includes(connector.status))
    return NextResponse.json(
      { error: { code: "GOOGLE_REAUTHORIZATION_REQUIRED", message: "Reconnect Google Drive first." } },
      { status: 409 },
    );
  try {
    const accessToken = await usableAccessToken(connector);
    return NextResponse.json(
      { accessToken, pickerApiKey, pickerAppId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "GOOGLE_TOKEN_UNAVAILABLE", message: "Drive authorization is unavailable right now. Try again shortly." } },
      { status: 503 },
    );
  }
}
