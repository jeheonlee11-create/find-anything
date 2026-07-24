import { NextResponse } from "next/server";
import {
  isIndexingServiceFailure,
  requireIndexingQueueService,
} from "@/lib/indexing/service-auth";
import { isIndexingQueueMessage } from "@/lib/indexing/queue-protocol";
import { releaseQueueDispatchLease } from "@/lib/indexing/jobs";

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
  await releaseQueueDispatchLease({
    message: body.message,
    leaseOwner: body.leaseOwner,
    errorCode: "QUEUE_DISPATCH_FAILED",
  });
  return new NextResponse(null, { status: 204 });
}
