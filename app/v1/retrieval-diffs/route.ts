import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { diffForWorkspace } from "@/lib/retrieval-diff/authorization";
export async function POST(request: Request) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.workspaceId && body.workspaceId !== principal.workspaceId) return NextResponse.json({ error: { code: "WORKSPACE_FORBIDDEN", message: "API key is scoped to another workspace." } }, { status: 403 });
  const beforeTraceId = typeof body.beforeTraceId === "string" ? body.beforeTraceId.slice(0, 200) : "", afterTraceId = typeof body.afterTraceId === "string" ? body.afterTraceId.slice(0, 200) : "";
  if (!beforeTraceId || !afterTraceId) return NextResponse.json({ error: { code: "INVALID_DIFF_REQUEST", message: "Two trace IDs are required." } }, { status: 400 });
  const diff = await diffForWorkspace({ workspaceId: principal.workspaceId, beforeTraceId, afterTraceId, manual: body.manual === true });
  return diff instanceof NextResponse ? diff : NextResponse.json(diff, { headers: { "cache-control": "no-store" } });
}
