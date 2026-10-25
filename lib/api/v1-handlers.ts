/**
 * The /v1 API operations, each taking an already-authenticated API-key
 * principal. The /v1 route files authenticate and delegate here; the MCP
 * server calls the same functions in-process instead of making an HTTP
 * request back to itself (which re-authenticated, charged the rate limit
 * twice, and depended on the Worker being able to reach its own URL).
 */
import { NextResponse } from "next/server";
import type { ApiPrincipal } from "@/lib/api/auth";
import { isDemoWorkspace } from "@/lib/auth/api-authorization";
import { decideConflict, refreshWorkspaceConflicts } from "@/lib/conflicts/repository";
import { connectorSearchAccess, permanentConnectorFailure } from "@/lib/google-drive/connector-health";
import { currentAuthorizedDriveSourceIds } from "@/lib/google-drive/permission";
import { connectorForWorkspace } from "@/lib/google-drive/repository";
import { refreshWorkspaceRelationships, relationshipsForFile } from "@/lib/lineage/repository";
import { diffForWorkspace } from "@/lib/retrieval-diff/authorization";
import { persistSearchAudit, receiptForWorkspace, traceForWorkspace } from "@/lib/workspace-search/audit";
import { currentlyAuthorizedWorkspaceFile } from "@/lib/workspace-search/authorization";
import type { WorkspaceFileType, WorkspaceSearchMode } from "@/lib/workspace-search/core";
import { liveWorkspaceCoverage } from "@/lib/workspace-search/coverage";
import { indexedWorkspaceFiles } from "@/lib/workspace-search/repository";
import { runWorkspaceSearch } from "@/lib/workspace-search/run-search";
import { publicReceipt, publicTrace } from "@/lib/workspace-search/serialization";

const FILE_TYPES = new Set<WorkspaceFileType>(["all", "docs", "slides", "sheets", "pdf"]);
const REVIEW_STATUSES = new Set(["authoritative_source", "expected_difference", "resolved", "false_positive"] as const);
type ReviewStatus = "authoritative_source" | "expected_difference" | "resolved" | "false_positive";

function failure(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
const forbidden = () => failure(403, "WORKSPACE_FORBIDDEN", "API key is scoped to another workspace.");
const fileNotFound = () => failure(404, "FILE_NOT_FOUND", "File not found.");

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function apiSearch(principal: ApiPrincipal, input: unknown, requestId: string) {
  const startedAt = Date.now(),
    body = record(input),
    headers = { "cache-control": "no-store", "x-request-id": requestId };
  if (body.workspaceId && body.workspaceId !== principal.workspaceId) return forbidden();
  const query = typeof body.query === "string" ? body.query.slice(0, 500) : "";
  if (!query.trim()) return failure(400, "INVALID_QUERY", "query is required.");
  if (body.fileType !== undefined && !FILE_TYPES.has(body.fileType as WorkspaceFileType))
    return failure(400, "INVALID_FILE_TYPE", "fileType must be all, docs, slides, sheets, or pdf.");
  const mode: WorkspaceSearchMode = body.mode === "all" ? "all" : "best",
    fileType = (body.fileType as WorkspaceFileType | undefined) ?? "all",
    cursor = typeof body.cursor === "string" ? body.cursor : null,
    pageSize = typeof body.pageSize === "number" ? body.pageSize : undefined;
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
  let search;
  try {
    search = await runWorkspaceSearch({ workspaceId: principal.workspaceId, connector, demo: isDemoWorkspace(principal.workspaceId), query, mode, fileType, cursor, pageSize });
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
  const { response, stageLatency } = search,
    audit = await persistSearchAudit({
      actor: { actorId: principal.actorId, email: "api-key-principal@localhost.invalid" },
      workspaceId: principal.workspaceId,
      response,
      filters: { fileType, cursor, pageSize: pageSize ?? 20 },
      startedAt,
      stageLatency,
      correlationId: requestId,
    });
  return NextResponse.json({ ...response, ...audit, requestId, retrieval: { kind: "literal", semanticPaused: true } }, { headers });
}

export async function apiFileCitations(principal: ApiPrincipal, fileId: string) {
  const { file } = await currentlyAuthorizedWorkspaceFile(principal.workspaceId, fileId);
  if (!file) return fileNotFound();
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

export async function apiFileRelationships(principal: ApiPrincipal, fileId: string) {
  const authorized = await currentlyAuthorizedWorkspaceFile(principal.workspaceId, fileId);
  if (!authorized.file) return fileNotFound();
  await refreshWorkspaceRelationships(principal.workspaceId, authorized.files);
  return NextResponse.json({
    fileId,
    relationships: await relationshipsForFile(principal.workspaceId, fileId, new Set(authorized.files.map((file) => file.id))),
  });
}

export async function apiCoverage(principal: ApiPrincipal, workspaceId: string) {
  if (workspaceId !== principal.workspaceId) return forbidden();
  try {
    return NextResponse.json(await liveWorkspaceCoverage(workspaceId), { headers: { "cache-control": "no-store" } });
  } catch {
    return failure(503, "COVERAGE_UNAVAILABLE", "Current Drive coverage could not be verified.");
  }
}

export async function apiTrace(principal: ApiPrincipal, traceId: string) {
  const row = await traceForWorkspace(principal.workspaceId, traceId);
  return row ? NextResponse.json(publicTrace(row)) : failure(404, "TRACE_NOT_FOUND", "Trace not found.");
}

export async function apiReceipt(principal: ApiPrincipal, receiptId: string) {
  const row = await receiptForWorkspace(principal.workspaceId, receiptId);
  return row ? NextResponse.json(publicReceipt(row)) : failure(404, "RECEIPT_NOT_FOUND", "Receipt not found.");
}

export async function apiRetrievalDiff(principal: ApiPrincipal, input: unknown) {
  const body = record(input);
  if (body.workspaceId && body.workspaceId !== principal.workspaceId) return forbidden();
  const beforeTraceId = typeof body.beforeTraceId === "string" ? body.beforeTraceId.slice(0, 200) : "",
    afterTraceId = typeof body.afterTraceId === "string" ? body.afterTraceId.slice(0, 200) : "";
  if (!beforeTraceId || !afterTraceId) return failure(400, "INVALID_DIFF_REQUEST", "Two trace IDs are required.");
  const diff = await diffForWorkspace({ workspaceId: principal.workspaceId, beforeTraceId, afterTraceId, manual: body.manual === true });
  return diff instanceof NextResponse ? diff : NextResponse.json(diff, { headers: { "cache-control": "no-store" } });
}

/** The current authorized, indexed files of the workspace, or null when Drive cannot be re-checked. */
async function authorizedIndexedFiles(workspaceId: string) {
  const connector = await connectorForWorkspace(workspaceId);
  if (!connector || !connectorSearchAccess(connector).allowed) return null;
  const inventory = await currentAuthorizedDriveSourceIds(connector);
  return indexedWorkspaceFiles(workspaceId, inventory.sourceIds);
}

export async function apiConflicts(principal: ApiPrincipal, workspaceId: string) {
  if (workspaceId !== principal.workspaceId) return forbidden();
  try {
    const files = await authorizedIndexedFiles(workspaceId);
    if (!files) return failure(409, "CONNECTOR_NOT_AUTHORIZED", "The workspace connector is not authorized.");
    return NextResponse.json(
      { detectionVersion: "deterministic-conflicts-v1", conflicts: await refreshWorkspaceConflicts(workspaceId, files) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return failure(503, "CONFLICT_REVALIDATION_FAILED", "Permissions could not be revalidated, so no conflict data was returned.");
  }
}

export async function apiReviewConflict(principal: ApiPrincipal, workspaceId: string, input: unknown) {
  if (workspaceId !== principal.workspaceId) return forbidden();
  const body = record(input),
    conflictId = typeof body.conflictId === "string" ? body.conflictId : "",
    status = body.status as ReviewStatus;
  if (!conflictId || !REVIEW_STATUSES.has(status))
    return failure(400, "INVALID_CONFLICT_DECISION", "A valid conflict ID and review decision are required.");
  const notFound = () => failure(404, "CONFLICT_NOT_FOUND", "Conflict not found.");
  try {
    const files = await authorizedIndexedFiles(workspaceId);
    if (!files) return notFound();
    const decided = await decideConflict(
      workspaceId,
      conflictId,
      status,
      principal.actorId,
      new Set(files.map((file) => file.id)),
      typeof body.authoritativeFileId === "string" ? body.authoritativeFileId : undefined,
      typeof body.note === "string" ? body.note : undefined,
    );
    return decided ? new Response(null, { status: 204 }) : notFound();
  } catch {
    return notFound();
  }
}
