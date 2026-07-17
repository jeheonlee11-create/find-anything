import { NextResponse } from "next/server";
import { runIndexingJob } from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const jobId = request.headers.get("x-find-anything-job-id") ?? "",
    token = request.headers.get("x-find-anything-job-token") ?? "";
  if (!jobId || !token)
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  const result = await runIndexingJob(jobId, token);
  if (!result)
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  return NextResponse.json(
    { jobId: result.jobId, status: result.status },
    {
      status: result.continuationNeeded ? 202 : 200,
      headers: result.continuationNeeded
        ? { "cache-control": "no-store", "x-find-anything-job-id": jobId, "x-find-anything-job-token": token }
        : { "cache-control": "no-store" },
    },
  );
}
