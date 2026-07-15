import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { currentlyAuthorizedWorkspaceFile } from "@/lib/workspace-search/authorization";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const { fileId } = await params,
    { file } = await currentlyAuthorizedWorkspaceFile(
      principal.workspaceId,
      fileId,
    );
  if (!file)
    return NextResponse.json(
      { error: { code: "FILE_NOT_FOUND", message: "File not found." } },
      { status: 404 },
    );
  const retrievedAt = new Date().toISOString();
  return NextResponse.json({
    fileId,
    extractionMethod: file.extractionMode ?? "unknown",
    source: "google_drive",
    sourceUrl: file.webViewLink,
    citations: file.units.map((unit) => ({
      fileId,
      sourceUrl: file.webViewLink,
      unitId: unit.id,
      unitType: unit.unitType,
      structuralLocation: unit.structuralLocation,
      exactExcerpt: unit.text,
      contentHash: unit.contentHash,
      retrievedAt,
    })),
  });
}
