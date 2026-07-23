import { NextResponse } from "next/server";
import { acknowledgeContinuation, runIndexingJob } from "@/lib/indexing/jobs";
import { logIndexingEvent } from "@/lib/observability/indexing-log";

export async function POST(request: Request) {
  const jobId = request.headers.get("x-find-anything-job-id") ?? "",
    token = request.headers.get("x-find-anything-job-token") ?? "",
    continuationId =
      request.headers.get("x-find-anything-continuation-id") ?? "";
  if (!jobId || !token || !continuationId)
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  if (!(await acknowledgeContinuation(jobId, token, continuationId)))
    return NextResponse.json(
      { error: { code: "CONTINUATION_NOT_AVAILABLE", message: "Not found." } },
      { status: 409 },
    );
  logIndexingEvent("worker_started", { jobId, stage: "connecting" });
  const result = await runIndexingJob(jobId, token, continuationId);
  if (!result)
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  return NextResponse.json(
    { jobId: result.jobId, status: result.status },
    {
      status: result.continuationNeeded ? 202 : 200,
      headers: result.continuationNeeded && result.continuationId
        ? {
            "cache-control": "no-store",
            "x-find-anything-job-id": jobId,
            "x-find-anything-job-token": token,
            "x-find-anything-continuation-id": result.continuationId,
          }
        : { "cache-control": "no-store" },
    },
  );
}
