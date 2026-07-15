import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import {
  correctRelationship,
  refreshWorkspaceRelationships,
  relationshipsForFile,
} from "@/lib/lineage/repository";
import { currentlyAuthorizedWorkspaceFile } from "@/lib/workspace-search/authorization";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const { fileId } = await params;
  const authorized = await currentlyAuthorizedWorkspaceFile(
    principal.workspaceId,
    fileId,
  );
  if (!authorized.file)
    return NextResponse.json(
      { error: { code: "FILE_NOT_FOUND", message: "File not found." } },
      { status: 404 },
    );
  await refreshWorkspaceRelationships(principal.workspaceId, authorized.files);
  return NextResponse.json({
    fileId,
    relationships: await relationshipsForFile(
      principal.workspaceId,
      fileId,
      new Set(authorized.files.map((file) => file.id)),
    ),
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const { fileId } = await params,
    authorized = await currentlyAuthorizedWorkspaceFile(
      principal.workspaceId,
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
  await correctRelationship(
    principal.workspaceId,
    body.relationshipId,
    body.status,
  );
  return new Response(null, { status: 204 });
}
