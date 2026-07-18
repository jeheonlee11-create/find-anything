import { NextResponse } from "next/server";
import { isAuthFailure, requireAuthenticatedUser } from "@/lib/auth/authorization";
import { diffForActor } from "@/lib/retrieval-diff/authorization";
export async function POST(request: Request) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const beforeTraceId = typeof body.beforeTraceId === "string" ? body.beforeTraceId.slice(0, 200) : "", afterTraceId = typeof body.afterTraceId === "string" ? body.afterTraceId.slice(0, 200) : "";
  if (!beforeTraceId || !afterTraceId) return NextResponse.json({ error: { code: "INVALID_DIFF_REQUEST", message: "Two trace IDs are required." } }, { status: 400 });
  const diff = await diffForActor({ actor, beforeTraceId, afterTraceId, manual: body.manual === true });
  return diff instanceof NextResponse ? diff : NextResponse.json(diff, { headers: { "cache-control": "no-store" } });
}
