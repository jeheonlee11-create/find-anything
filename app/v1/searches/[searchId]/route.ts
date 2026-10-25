import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { receiptForWorkspaceSearch } from "@/lib/workspace-search/audit";
import { publicReceipt } from "@/lib/workspace-search/serialization";
export async function GET(request: Request, { params }: { params: Promise<{ searchId: string }> }) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const { searchId } = await params,
    row = await receiptForWorkspaceSearch(principal.workspaceId, searchId);
  return row
    ? NextResponse.json(publicReceipt(row))
    : NextResponse.json({ error: { code: "SEARCH_NOT_FOUND", message: "Search not found." } }, { status: 404 });
}
