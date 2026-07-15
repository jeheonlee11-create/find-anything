import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { actorWorkspace } from "@/lib/workspaces/repository";
import {
  searchWorkspaceFiles,
  type WorkspaceFileType,
  type WorkspaceSearchMode,
} from "@/lib/workspace-search/core";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { persistSearchAudit } from "@/lib/workspace-search/audit";
import { connectorForActor } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { rateLimit, recordBetaEvent } from "@/lib/beta/repository";
const fileTypes = new Set<WorkspaceFileType>([
    "all",
    "docs",
    "slides",
    "sheets",
    "pdf",
  ]),
  modes = new Set<WorkspaceSearchMode>(["best", "all"]);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  if (!(await rateLimit(actor.actorId, "workspace_search", 60, 60))) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Search limit reached. Please retry in one minute." } }, { status: 429 });
  const startedAt = Date.now();
  try {
    const { workspaceId } = await params,
      authorizationDone = Date.now();
    if (!(await actorWorkspace(actor.actorId, workspaceId)))
      return NextResponse.json(
        {
          error: {
            code: "WORKSPACE_NOT_FOUND",
            message: "Workspace not found.",
          },
        },
        { status: 404 },
      );
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >,
      query = typeof body.query === "string" ? body.query.slice(0, 500) : "",
      mode = modes.has(body.mode as WorkspaceSearchMode)
        ? (body.mode as WorkspaceSearchMode)
        : "best",
      fileType = fileTypes.has(body.fileType as WorkspaceFileType)
        ? (body.fileType as WorkspaceFileType)
        : "all",
      cursor = typeof body.cursor === "string" ? body.cursor : null,
      pageSize = typeof body.pageSize === "number" ? body.pageSize : 20,
      connector = await connectorForActor(actor, workspaceId);
    if (!connector || connector.status !== "connected")
      return NextResponse.json(
        {
          error: {
            code: "GOOGLE_DRIVE_NOT_CONNECTED",
            message: "Connect Google Drive before searching this workspace.",
          },
        },
        { status: 409 },
      );
    const permissionInventory =
        await currentAuthorizedDriveSourceIds(connector),
      files = await indexedWorkspaceFiles(
        workspaceId,
        permissionInventory.sourceIds,
      ),
      filesLoaded = Date.now(),
      response = searchWorkspaceFiles({
        workspaceId,
        files,
        query,
        mode,
        fileType,
        cursor,
        pageSize,
        permissionContext: {
          authorizedFilesDiscovered: permissionInventory.filesDiscovered,
          paginationComplete: permissionInventory.paginationComplete,
          lastSuccessfulSyncAt: connector.lastSyncAt,
        },
      }),
      matchingDone = Date.now(),
      audit = await persistSearchAudit({
        actor,
        workspaceId,
        response,
        filters: { fileType, cursor, pageSize },
        startedAt,
        stageLatency: {
          authorizationMs: authorizationDone - startedAt,
          permissionInventoryMs: filesLoaded - authorizationDone,
          loadFilesMs: filesLoaded - authorizationDone,
          matchingMs: matchingDone - filesLoaded,
        },
        correlationId: requestId,
      });
    await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "search_performed", properties: { mode, resultCount: response.totalMatches, zeroResults: response.totalMatches === 0 } });
    return NextResponse.json(
      {
        ...response,
        ...audit,
        retrieval: { kind: "literal", semanticPaused: true },
      },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "SEARCH_UNAVAILABLE";
    return NextResponse.json(
      {
        error: {
          code: code.startsWith("GOOGLE_")
            ? "PERMISSION_REVALIDATION_FAILED"
            : "SEARCH_UNAVAILABLE",
          message: code.startsWith("GOOGLE_")
            ? "Drive permissions could not be verified, so no results were returned."
            : "Workspace search is temporarily unavailable.",
        },
      },
      {
        status: 503,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
}
