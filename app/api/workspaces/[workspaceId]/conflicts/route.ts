import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { actorWorkspace } from "@/lib/workspaces/repository";
import { connectorForActor } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { connectorSearchAccess } from "@/lib/google-drive/connector-health";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { decideConflict, refreshWorkspaceConflicts } from "@/lib/conflicts/repository";

export async function GET(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const actor = await requireApiActor(request); if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params; if (!(await actorWorkspace(actor.actorId, workspaceId))) return notFound();
  try { const connector = await connectorForActor(actor, workspaceId); if (!connector || !connectorSearchAccess(connector).allowed) return NextResponse.json({ error: { code: "CONNECTOR_NOT_AUTHORIZED", message: "Reconnect Google Drive before reviewing conflicts." } }, { status: 409 }); const inventory = await currentAuthorizedDriveSourceIds(connector), files = await indexedWorkspaceFiles(workspaceId, inventory.sourceIds); return NextResponse.json({ detectionVersion: "deterministic-conflicts-v1", conflicts: await refreshWorkspaceConflicts(workspaceId, files) }, { headers: { "cache-control": "no-store" } }); } catch { return NextResponse.json({ error: { code: "CONFLICT_REVALIDATION_FAILED", message: "Permissions could not be revalidated, so no conflict data was returned." } }, { status: 503 }); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const actor = await requireApiActor(request); if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params; if (!(await actorWorkspace(actor.actorId, workspaceId))) return notFound();
  const body = await request.json().catch(() => ({})) as { conflictId?: string; status?: "authoritative_source" | "expected_difference" | "resolved" | "false_positive"; authoritativeFileId?: string; note?: string };
  if (!body.conflictId || !body.status || !["authoritative_source", "expected_difference", "resolved", "false_positive"].includes(body.status)) return NextResponse.json({ error: { code: "INVALID_CONFLICT_DECISION", message: "A valid conflict ID and review decision are required." } }, { status: 400 });
  try { const connector = await connectorForActor(actor, workspaceId); if (!connector || !connectorSearchAccess(connector).allowed) return notFound(); const inventory = await currentAuthorizedDriveSourceIds(connector), files = await indexedWorkspaceFiles(workspaceId, inventory.sourceIds), authorized = new Set(files.map((file) => file.id)); if (!(await decideConflict(workspaceId, body.conflictId, body.status, actor.actorId, authorized, body.authoritativeFileId, body.note))) return notFound(); } catch { return notFound(); }
  return new Response(null, { status: 204 });
}
function notFound() { return NextResponse.json({ error: { code: "WORKSPACE_OR_CONFLICT_NOT_FOUND", message: "Workspace or conflict not found." } }, { status: 404 }); }
