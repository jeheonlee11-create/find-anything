import { NextResponse } from "next/server";
import {
  isAuthFailure,
  isAuthorizationFailure,
  requireAuthenticatedUser,
  requireTraceAccess,
} from "@/lib/auth/authorization";
import { publicTrace } from "@/lib/workspace-search/serialization";

export async function GET(request: Request, { params }: { params: Promise<{ traceId: string }> }) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const { traceId } = await params,
    row = await requireTraceAccess(actor, traceId);
  if (isAuthorizationFailure(row)) return row;
  return NextResponse.json(publicTrace(row), {
    headers: { "cache-control": "no-store" },
  });
}
