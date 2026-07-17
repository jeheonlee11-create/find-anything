import { NextResponse } from "next/server";
import {
  isAuthFailure,
  isAuthorizationFailure,
  requireAuthenticatedUser,
  requireWorkspaceMember,
} from "@/lib/auth/authorization";
import { indexingJobForWorkspace } from "@/lib/indexing/jobs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "",
    authorized = await requireWorkspaceMember(actor, workspaceId);
  if (isAuthorizationFailure(authorized)) return authorized;
  const { jobId } = await params,
    job = await indexingJobForWorkspace(workspaceId, jobId);
  if (!job)
    return NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Indexing job not found." } }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "cache-control": "no-store" } });
}
