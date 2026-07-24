import { NextResponse } from "next/server";
import {
  isIndexingServiceFailure,
  requireIndexingQueueService,
} from "@/lib/indexing/service-auth";
import { isIndexingQueueMessage } from "@/lib/indexing/queue-protocol";
import { failQueueContinuationPermanently } from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const service = await requireIndexingQueueService(request);
  if (isIndexingServiceFailure(service)) return service.response;
  const body = JSON.parse(service.body) as { message?: unknown };
  if (!isIndexingQueueMessage(body.message))
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid request." } },
      { status: 400 },
    );
  await failQueueContinuationPermanently({
    message: body.message,
    errorCode: "QUEUE_DELIVERY_EXHAUSTED",
  });
  return new NextResponse(null, { status: 204 });
}
