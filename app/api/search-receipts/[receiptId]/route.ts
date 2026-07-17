import { NextResponse } from "next/server";
import {
  isAuthFailure,
  isAuthorizationFailure,
  requireAuthenticatedUser,
  requireReceiptAccess,
} from "@/lib/auth/authorization";
import { publicReceipt, receiptCsv } from "@/lib/workspace-search/serialization";

export async function GET(request: Request, { params }: { params: Promise<{ receiptId: string }> }) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const { receiptId } = await params,
    row = await requireReceiptAccess(actor, receiptId);
  if (isAuthorizationFailure(row)) return row;
  const receipt = publicReceipt(row),
    format = new URL(request.url).searchParams.get("format");
  if (format === "csv")
    return new Response(receiptCsv(receipt), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${receiptId}.csv"`,
      },
    });
  return NextResponse.json(receipt, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": format === "json" ? `attachment; filename="${receiptId}.json"` : "inline",
    },
  });
}
