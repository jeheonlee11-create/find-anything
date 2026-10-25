import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { apiConflicts, apiReviewConflict } from "@/lib/api/v1-handlers";

type Params = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Params) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  return apiConflicts(principal, (await params).workspaceId);
}

export async function PATCH(request: Request, { params }: Params) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  return apiReviewConflict(principal, (await params).workspaceId, await request.json().catch(() => ({})));
}
