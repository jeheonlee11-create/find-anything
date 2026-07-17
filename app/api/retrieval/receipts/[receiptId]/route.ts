import { NextResponse } from "next/server";
import {
  isAuthFailure,
  requireAuthenticatedUser,
  requireReceiptAccess,
  isAuthorizationFailure,
} from "@/lib/auth/authorization";
import { publicReceipt } from "@/lib/workspace-search/serialization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const { receiptId } = await params;
  const receipt = await requireReceiptAccess(actor, receiptId);
  if (isAuthorizationFailure(receipt)) return receipt;
  return NextResponse.json(publicReceipt(receipt), {
    headers: { "cache-control": "no-store" },
  });
}
