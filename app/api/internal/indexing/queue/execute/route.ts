import { NextResponse } from "next/server";
import {
  claimQueueContinuationExecution,
  continuationTerminalResult,
  runIndexingJob,
} from "@/lib/indexing/jobs";
import {
  continuationMessage,
  isIndexingQueueMessage,
} from "@/lib/indexing/queue-protocol";
import {
  isIndexingServiceFailure,
  requireIndexingQueueService,
} from "@/lib/indexing/service-auth";

export async function POST(request: Request) {
  const service = await requireIndexingQueueService(request);
  if (isIndexingServiceFailure(service)) return service.response;
  const body = JSON.parse(service.body) as {
    message?: unknown;
    leaseOwner?: unknown;
  };
  if (
    !isIndexingQueueMessage(body.message) ||
    typeof body.leaseOwner !== "string"
  )
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid request." } },
      { status: 400 },
    );
  const claimed = await claimQueueContinuationExecution({
    message: body.message,
    leaseOwner: body.leaseOwner,
  });
  if (!claimed) {
    const terminal = await continuationTerminalResult(body.message);
    if (terminal?.status === "completed")
      return NextResponse.json({
        jobId: body.message.jobId,
        continuationId: body.message.continuationId,
        status: "completed",
        terminal: true,
        next: null,
        duplicate: true,
      });
    return NextResponse.json(
      {
        error: {
          code: "CONTINUATION_ALREADY_LEASED",
          message: "Continuation is already being processed.",
        },
      },
      { status: 409 },
    );
  }
  const result = await runIndexingJob(
    body.message.jobId,
    "",
    body.message.continuationId,
    { queueClaimed: true },
  );
  if (!result)
    return NextResponse.json(
      { error: { code: "CONTINUATION_NOT_AVAILABLE", message: "Not found." } },
      { status: 409 },
    );
  const next =
    result.continuationNeeded &&
    result.continuationId &&
    result.continuationSequence &&
    result.attemptEpoch
      ? continuationMessage({
          jobId: result.jobId,
          continuationId: result.continuationId,
          sequence: result.continuationSequence,
          attemptEpoch: result.attemptEpoch,
        })
      : null;
  return NextResponse.json({
    jobId: result.jobId,
    continuationId: body.message.continuationId,
    status: result.status,
    terminal: !result.continuationNeeded,
    next,
  });
}
