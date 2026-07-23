import { NextResponse } from "next/server";
import {
  failContinuation,
  failIndexingJobScheduling,
} from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const jobId = request.headers.get("x-find-anything-job-id") ?? "",
    token = request.headers.get("x-find-anything-job-token") ?? "",
    continuationId =
      request.headers.get("x-find-anything-continuation-id") ?? "";
  if (!jobId || !token)
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  const failed = await failIndexingJobScheduling(jobId, token);
  if (continuationId)
    await failContinuation(
      jobId,
      continuationId,
      "CONTINUATION_SCHEDULING_FAILED",
    );
  return failed
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found." } },
        { status: 404 },
      );
}
