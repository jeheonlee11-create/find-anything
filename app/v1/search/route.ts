import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import {
  searchWorkspaceFiles,
  type WorkspaceFileType,
  type WorkspaceSearchMode,
} from "@/lib/workspace-search/core";
import { persistSearchAudit } from "@/lib/workspace-search/audit";
import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { isLocalDemoWorkspace } from "@/lib/auth/api-authorization";
import { calculateRetrievalConfidence } from "@/lib/workspace-search/confidence";
import { conflictsForFiles, unresolvedConflictCount } from "@/lib/conflicts/repository";
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
  const connector = await connectorForWorkspace(principal.workspaceId, isLocalDemoWorkspace(principal.workspaceId) ? "demo_fixture" : "google_drive");
  if (!connector || connector.status !== "connected")
    return NextResponse.json(
      {
        error: {
          code: "GOOGLE_DRIVE_NOT_CONNECTED",
          message: "The API-key workspace has no active Drive connection.",
        },
      },
      { status: 409 },
    );
  let permissionInventory;
  try {
    permissionInventory = isLocalDemoWorkspace(principal.workspaceId)
      ? { sourceIds: undefined, filesDiscovered: 5, paginationComplete: true }
      : await currentAuthorizedDriveSourceIds(connector);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "PERMISSION_REVALIDATION_FAILED",
          message:
            "Drive permissions could not be verified, so no results were returned.",
          requestId,
        },
      },
      {
        status: 503,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      },
    );
  }
  const mode = body.mode === "all" ? "all" : "best",
    fileType = body.fileType ?? "all",
    files = await indexedWorkspaceFiles(
      principal.workspaceId,
      permissionInventory.sourceIds,
    ),
    detectedConflicts = await conflictsForFiles(principal.workspaceId, files.map((file) => file.id)),
    unresolvedFileIds = new Set(detectedConflicts.filter((item) => item.status === "unresolved").flatMap((item) => [item.leftFileId, item.rightFileId])),
    authoritativeFileIds = new Set(detectedConflicts.filter((item) => item.status === "authoritative_source" && item.decision?.authoritativeFileId).map((item) => String(item.decision.authoritativeFileId))),
    response = searchWorkspaceFiles({
      workspaceId: principal.workspaceId,
      files,
      query: body.query,
      mode,
      fileType,
      cursor: body.cursor,
      pageSize: body.pageSize,
      permissionContext: {
        authorizedFilesDiscovered: permissionInventory.filesDiscovered,
        paginationComplete: permissionInventory.paginationComplete,
        lastSuccessfulSyncAt: connector.lastSyncAt,
      },
      rankingContext: { unresolvedConflictFileIds: unresolvedFileIds, authoritativeFileIds, conflictAssessmentComplete: true },
    }),
    resultIds = new Set(response.results.map((result) => result.id));
  response.conflicts = detectedConflicts.filter((item) => resultIds.has(item.leftFileId) || resultIds.has(item.rightFileId));
  const conflictCount = unresolvedConflictCount(response.conflicts);
  response.confidence = calculateRetrievalConfidence({
    coverage: response.coverage,
    results: response.results,
    permissionDecisionCount: response.diagnostics.permissionDecisions.length,
    connector: { searched: 1, expectedConfigured: 1 },
    unresolvedConflictCount: conflictCount,
    conflictAssessmentComplete: true,
    retrievalMode: "literal",
  });
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
      correlationId: requestId,
    });
  return NextResponse.json(
    {
      ...response,
      ...audit,
      requestId,
      retrieval: { kind: "literal", semanticPaused: true },
    },
    { headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
