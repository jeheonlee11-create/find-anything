import { NextResponse } from "next/server";
import { failIndexingJobScheduling } from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const jobId = request.headers.get("x-find-anything-job-id") ?? "",
    token = request.headers.get("x-find-anything-job-token") ?? "";
  if (!jobId || !token)
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  const failed = await failIndexingJobScheduling(jobId, token);
  return failed
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found." } },
        { status: 404 },
      );
}
