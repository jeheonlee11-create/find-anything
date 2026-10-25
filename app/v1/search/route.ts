import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import type { WorkspaceFileType, WorkspaceSearchMode } from "@/lib/workspace-search/core";
import { runWorkspaceSearch } from "@/lib/workspace-search/run-search";
import { persistSearchAudit } from "@/lib/workspace-search/audit";
import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { connectorSearchAccess, permanentConnectorFailure } from "@/lib/google-drive/connector-health";
import { isDemoWorkspace } from "@/lib/auth/api-authorization";
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID(),
    principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const startedAt = Date.now(),
    body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      query?: string;
      mode?: WorkspaceSearchMode;
      fileType?: WorkspaceFileType;
      cursor?: string;
      pageSize?: number;
    };
  if (body.workspaceId && body.workspaceId !== principal.workspaceId)
    return NextResponse.json(
      {
        error: {
          code: "WORKSPACE_FORBIDDEN",
          message: "API key is scoped to another workspace.",
        },
      },
      { status: 403 },
    );
  if (!body.query?.trim())
    return NextResponse.json(
      { error: { code: "INVALID_QUERY", message: "query is required." } },
      { status: 400 },
    );
  const allowedTypes = new Set<WorkspaceFileType>([
    "all",
    "docs",
    "slides",
    "sheets",
    "pdf",
  ]);
  if (body.fileType && !allowedTypes.has(body.fileType))
    return NextResponse.json(
      {
        error: {
          code: "INVALID_FILE_TYPE",
          message: "fileType must be all, docs, slides, sheets, or pdf.",
        },
      },
      { status: 400 },
    );
  const connector = await connectorForWorkspace(principal.workspaceId, isDemoWorkspace(principal.workspaceId) ? "demo_fixture" : "google_drive"),
    access = connectorSearchAccess(connector);
  if (!connector || !access.allowed)
    return NextResponse.json(
      {
        error: access.allowed
          ? { code: "GOOGLE_DRIVE_NOT_CONNECTED", message: "The API-key workspace has no active Drive connection." }
          : { code: access.code, message: access.message },
      },
      { status: 409 },
    );
  const mode = body.mode === "all" ? "all" : "best",
    fileType = body.fileType ?? "all",
    headers = { "cache-control": "no-store", "x-request-id": requestId };
  let search;
  try {
    search = await runWorkspaceSearch({
      workspaceId: principal.workspaceId,
      connector,
      demo: isDemoWorkspace(principal.workspaceId),
      query: body.query,
      mode,
      fileType,
      cursor: body.cursor,
      pageSize: body.pageSize,
    });
  } catch (error) {
    const google = error instanceof Error && error.message.startsWith("GOOGLE_"),
      permanent = google ? permanentConnectorFailure(error) : null;
    if (permanent) return NextResponse.json({ error: { ...permanent, requestId } }, { status: 409, headers });
    return NextResponse.json(
      {
        error: google
          ? { code: "PERMISSION_REVALIDATION_FAILED", message: "Drive permissions could not be verified, so no results were returned.", requestId }
          : { code: "SEARCH_UNAVAILABLE", message: "Workspace search is temporarily unavailable.", requestId },
      },
      { status: 503, headers },
    );
  }
  const { response, stageLatency } = search;
  const audit = await persistSearchAudit({
      actor: {
        actorId: principal.actorId,
        email: "api-key-principal@localhost.invalid",
      },
      workspaceId: principal.workspaceId,
      response,
      filters: {
        fileType,
        cursor: body.cursor ?? null,
        pageSize: body.pageSize ?? 20,
      },
      startedAt,
      stageLatency,
      correlationId: requestId,
    });
  return NextResponse.json(
    {
      ...response,
      ...audit,
      requestId,
      retrieval: { kind: "literal", semanticPaused: true },
    },
    { headers },
  );
}
