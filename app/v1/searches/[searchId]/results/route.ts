import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { receiptForWorkspaceSearch, traceForWorkspace } from "@/lib/workspace-search/audit";
import { decodeWorkspaceSearchCursor, encodeWorkspaceSearchCursor } from "@/lib/workspace-search/core";
import { publicTrace } from "@/lib/workspace-search/serialization";
export async function GET(request: Request, { params }: { params: Promise<{ searchId: string }> }) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const { searchId } = await params,
    receipt = await receiptForWorkspaceSearch(principal.workspaceId, searchId);
  if (!receipt)
    return NextResponse.json({ error: { code: "SEARCH_NOT_FOUND", message: "Search not found." } }, { status: 404 });
  const trace = await traceForWorkspace(principal.workspaceId, receipt.traceId),
    all = trace ? publicTrace(trace).results : [],
    url = new URL(request.url),
    offset = decodeWorkspaceSearchCursor(url.searchParams.get("cursor")),
    size = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20)),
    results = all.slice(offset, offset + size),
    next = offset + results.length < all.length ? encodeWorkspaceSearchCursor(offset + results.length) : null;
  return NextResponse.json({ searchId, results, nextCursor: next, total: all.length });
}
