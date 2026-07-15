import { NextResponse } from "next/server";
import { requireWorkspaceApiKey } from "@/lib/api/auth";
import { liveWorkspaceCoverage } from "@/lib/workspace-search/coverage";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const principal = await requireWorkspaceApiKey(request);
  if (principal instanceof NextResponse) return principal;
  const { workspaceId } = await params;
  if (workspaceId !== principal.workspaceId)
    return NextResponse.json(
      {
        error: {
          code: "WORKSPACE_FORBIDDEN",
          message: "API key is scoped to another workspace.",
        },
      },
      { status: 403 },
    );
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
