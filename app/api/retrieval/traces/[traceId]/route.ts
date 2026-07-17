import { NextResponse } from "next/server";
import {
  isAuthFailure,
  requireAuthenticatedUser,
  requireTraceAccess,
  isAuthorizationFailure,
} from "@/lib/auth/authorization";
import { publicTrace } from "@/lib/workspace-search/serialization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const { traceId } = await params;
  const trace = await requireTraceAccess(actor, traceId);
  if (isAuthorizationFailure(trace)) return trace;
  return NextResponse.json(publicTrace(trace), {
    headers: { "cache-control": "no-store" },
  });
}
