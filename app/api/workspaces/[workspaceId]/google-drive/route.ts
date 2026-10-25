import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { actorWorkspace, workspaceDashboard } from "@/lib/workspaces/repository";
import { connectorForActor, deleteConnectorData } from "@/lib/google-drive/repository";
import { decryptSecret, secretContext } from "@/lib/google-drive/crypto";
import { revokeGoogleToken } from "@/lib/google-drive/oauth";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Params) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  try {
    const { workspaceId } = await params,
      dashboard = await workspaceDashboard(actor.actorId, workspaceId);
    if (!dashboard)
      return NextResponse.json({ error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } }, { status: 404 });
    return NextResponse.json(
      { connector: dashboard.connector, files: dashboard.files, latestSync: dashboard.latestSync },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "Workspace storage is unavailable." } }, { status: 503 });
  }
}

/**
 * Disconnect and delete. Google must confirm token revocation first; if it does
 * not, nothing is deleted and the owner can retry safely.
 */
export async function DELETE(request: Request, { params }: Params) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params;
  try {
    const workspace = await actorWorkspace(actor.actorId, workspaceId);
    if (!workspace)
      return NextResponse.json({ error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } }, { status: 404 });
    if (workspace.role !== "owner")
      return NextResponse.json({ error: { code: "OWNER_REQUIRED", message: "Only the workspace owner can disconnect Drive." } }, { status: 403 });
    const connector = await connectorForActor(actor, workspaceId);
    if (!connector) return new NextResponse(null, { status: 204 });
    try {
      // Revoking the refresh token revokes the whole grant; fall back to the access token.
      const token = connector.refreshTokenCiphertext
        ? await decryptSecret(connector.refreshTokenCiphertext, secretContext.connectorRefreshToken(workspaceId))
        : await decryptSecret(connector.accessTokenCiphertext, secretContext.connectorAccessToken(workspaceId));
      await revokeGoogleToken(token);
    } catch {
      return NextResponse.json(
        { error: { code: "GOOGLE_REVOCATION_FAILED", message: "Google did not confirm token revocation. Nothing was deleted; retry safely." } },
        { status: 502 },
      );
    }
    await deleteConnectorData(connector.id, workspaceId);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: { code: "DISCONNECT_FAILED", message: "Drive could not be disconnected safely." } }, { status: 503 });
  }
}
