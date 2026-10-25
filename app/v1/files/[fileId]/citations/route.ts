import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { apiFileCitations } from "@/lib/api/v1-handlers";

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  return apiFileCitations(principal, (await params).fileId);
}
