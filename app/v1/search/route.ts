import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { apiSearch } from "@/lib/api/v1-handlers";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID(),
    principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  return apiSearch(principal, await request.json().catch(() => ({})), requestId);
}
