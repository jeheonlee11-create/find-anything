import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { rateLimit, recordBetaEvent, saveFeedback } from "@/lib/beta/repository";
import { actorWorkspace } from "@/lib/workspaces/repository";

const categories = new Set(["missing_file", "wrong_result", "missing_match", "bad_ranking", "confusing_evidence", "permission_concern", "other"]);

export async function POST(request: Request) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  if (!(await rateLimit(actor.actorId, "feedback", 10, 3600))) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many feedback reports. Please try again later." } }, { status: 429 });
  const body = await request.json().catch(() => null) as { workspaceId?: unknown; category?: unknown; query?: unknown; traceId?: unknown; resultIds?: unknown; comment?: unknown } | null;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId || !(await actorWorkspace(actor.actorId, workspaceId))) return NextResponse.json({ error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." } }, { status: 404 });
  if (typeof body?.category !== "string" || !categories.has(body.category) || typeof body?.comment !== "string" || body.comment.trim().length < 2 || body.comment.length > 2000) return NextResponse.json({ error: { code: "INVALID_FEEDBACK", message: "Choose an issue type and add a short description." } }, { status: 400 });
  const id = await saveFeedback({ actorId: actor.actorId, workspaceId, category: body.category, query: typeof body.query === "string" ? body.query : "", traceId: typeof body.traceId === "string" ? body.traceId : null, resultIds: Array.isArray(body.resultIds) ? body.resultIds.filter((value): value is string => typeof value === "string") : [], comment: body.comment.trim() });
  await recordBetaEvent({ actorId: actor.actorId, workspaceId, event: "feedback_submitted", properties: { category: body.category } });
  return NextResponse.json({ id, received: true }, { status: 201, headers: { "cache-control": "no-store" } });
}
