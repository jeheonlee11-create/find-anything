import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { apiRetrievalDiff } from "@/lib/api/v1-handlers";

export async function POST(request: Request) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  return apiRetrievalDiff(principal, await request.json().catch(() => ({})));
}
