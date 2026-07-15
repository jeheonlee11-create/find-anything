import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { actorWorkspace } from "@/lib/workspaces/repository";
import { liveWorkspaceCoverage } from "@/lib/workspace-search/coverage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const { workspaceId } = await params;
  if (!(await actorWorkspace(actor.actorId, workspaceId)))
    return NextResponse.json(
      {
        error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found." },
      },
      { status: 404 },
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
