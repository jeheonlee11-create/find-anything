import { NextResponse } from "next/server";
import {
  isAuthFailure,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";

export async function POST(request: Request) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  return NextResponse.json(
    {
      error: {
        code: "ROUTE_RETIRED",
        message:
          "Use /api/workspaces/{workspaceId}/search for permission-aware retrieval.",
      },
    },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
