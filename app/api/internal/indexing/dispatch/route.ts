import { NextResponse } from "next/server";
import { markContinuationDispatched } from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const jobId = request.headers.get("x-find-anything-job-id") ?? "";
  const token = request.headers.get("x-find-anything-job-token") ?? "";
  const continuationId =
    request.headers.get("x-find-anything-continuation-id") ?? "";
  if (!jobId || !token || !continuationId)
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  const dispatched = await markContinuationDispatched(
    jobId,
    token,
    continuationId,
  );
  return dispatched
    ? NextResponse.json({ status: "dispatched" }, { status: 202 })
    : NextResponse.json(
        { error: { code: "DISPATCH_NOT_AVAILABLE", message: "Not found." } },
        { status: 409 },
      );
}
