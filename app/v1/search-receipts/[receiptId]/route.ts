import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { apiReceipt } from "@/lib/api/v1-handlers";

export async function GET(request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  return apiReceipt(principal, (await params).receiptId);
}
