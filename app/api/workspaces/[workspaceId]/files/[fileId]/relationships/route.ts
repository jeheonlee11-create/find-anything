import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { actorWorkspace } from "@/lib/workspaces/repository";
import {
  correctRelationship,
  refreshWorkspaceRelationships,
  relationshipsForFile,
} from "@/lib/lineage/repository";
import { currentlyAuthorizedWorkspaceFile } from "@/lib/workspace-search/authorization";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> },
) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId, fileId } = await params;
  if (!(await actorWorkspace(actor.actorId, workspaceId)))
    return NextResponse.json(
      {
        error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." },
      },
      { status: 404 },
    );
  const authorized = await currentlyAuthorizedWorkspaceFile(
    workspaceId,
    fileId,
  );
  if (!authorized.file)
    return NextResponse.json(
      { error: { code: "FILE_NOT_FOUND", message: "File not found." } },
      { status: 404 },
    );
  await refreshWorkspaceRelationships(workspaceId, authorized.files);
  return NextResponse.json({
    relationships: await relationshipsForFile(
      workspaceId,
      fileId,
      new Set(authorized.files.map((file) => file.id)),
    ),
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; fileId: string }> },
) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId, fileId } = await params;
  if (!(await actorWorkspace(actor.actorId, workspaceId)))
    return NextResponse.json(
      {
        error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." },
      },
      { status: 404 },
    );
  const authorized = await currentlyAuthorizedWorkspaceFile(
    workspaceId,
    fileId,
  );
  if (!authorized.file)
    return NextResponse.json(
      { error: { code: "FILE_NOT_FOUND", message: "File not found." } },
      { status: 404 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    relationshipId?: string;
    status?: "confirmed" | "rejected" | "unreviewed";
  };
  if (!body.relationshipId || !body.status)
    return NextResponse.json(
      {
        error: {
          code: "INVALID_CORRECTION",
          message: "relationshipId and status are required.",
        },
      },
      { status: 400 },
    );
  await correctRelationship(workspaceId, body.relationshipId, body.status);
  return new Response(null, { status: 204 });
}
