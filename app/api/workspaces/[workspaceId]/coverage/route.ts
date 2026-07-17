import { NextResponse } from "next/server";
import {
  isAuthFailure,
  isAuthorizationFailure,
  requireAuthenticatedUser,
  requireWorkspaceMember,
} from "@/lib/auth/authorization";
import { liveWorkspaceCoverage } from "@/lib/workspace-search/coverage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params;
  const authorized = await requireWorkspaceMember(actor, workspaceId);
  if (isAuthorizationFailure(authorized)) return authorized;
  try {
    return NextResponse.json(await liveWorkspaceCoverage(workspaceId), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "COVERAGE_UNAVAILABLE",
          message: "Current Drive coverage could not be verified.",
        },
      },
      { status: 503 },
    );
  }
}
