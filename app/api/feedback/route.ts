import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { rateLimit, recordBetaEvent, saveFeedback } from "@/lib/beta/repository";
import { actorWorkspace } from "@/lib/workspaces/repository";

const categories = new Set(["found_what_needed", "did_not_find", "missing_file", "missing_match", "incorrect_match", "poor_ranking", "incorrect_evidence", "confusing_interface", "permission_concern", "indexing_problem", "performance_problem", "other"]);

export async function POST(request: Request) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  if (!(await rateLimit(actor.actorId, "feedback", 10, 3600))) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many feedback reports. Please try again later." } }, { status: 429 });
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > 16_384) return NextResponse.json({ error: { code: "REQUEST_TOO_LARGE", message: "Feedback reports are limited to 16 KB." } }, { status: 413 });
  const body = await request.json().catch(() => null) as { workspaceId?: unknown; category?: unknown; query?: unknown; searchMode?: unknown; traceId?: unknown; receiptId?: unknown; selectedResultId?: unknown; resultIds?: unknown; comment?: unknown; includeEvidenceExcerpt?: unknown; evidenceExcerpt?: unknown } | null;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId || !(await actorWorkspace(actor.actorId, workspaceId))) return NextResponse.json({ error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } }, { status: 404 });
  if (typeof body?.category !== "string" || !categories.has(body.category) || typeof body?.comment !== "string" || body.comment.trim().length < 2 || body.comment.length > 2000) return NextResponse.json({ error: { code: "INVALID_FEEDBACK", message: "Choose an issue type and add a short description." } }, { status: 400 });
  const includeEvidenceExcerpt = body.includeEvidenceExcerpt === true;
  const id = await saveFeedback({ actorId: actor.actorId, workspaceId, category: body.category, query: typeof body.query === "string" ? body.query : "", searchMode: typeof body.searchMode === "string" ? body.searchMode : null, traceId: typeof body.traceId === "string" ? body.traceId : null, receiptId: typeof body.receiptId === "string" ? body.receiptId : null, selectedResultId: typeof body.selectedResultId === "string" ? body.selectedResultId : null, resultIds: Array.isArray(body.resultIds) ? body.resultIds.filter((value): value is string => typeof value === "string") : [], comment: body.comment.trim(), includeEvidenceExcerpt, evidenceExcerpt: includeEvidenceExcerpt && typeof body.evidenceExcerpt === "string" ? body.evidenceExcerpt : null, applicationVersion: process.env.APP_VERSION ?? process.env.CF_VERSION_METADATA?.slice(0, 80) ?? "unknown" });
  await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "feedback_submitted", properties: { category: body.category } });
  return NextResponse.json({ id, received: true }, { status: 201, headers: { "cache-control": "no-store" } });
}
