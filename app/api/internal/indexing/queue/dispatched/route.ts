import { NextResponse } from "next/server";
import {
  isIndexingServiceFailure,
  requireIndexingQueueService,
} from "@/lib/indexing/service-auth";
import {
  isIndexingQueueMessage,
  type IndexingQueueMessage,
} from "@/lib/indexing/queue-protocol";
import { markQueueContinuationDispatched } from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const service = await requireIndexingQueueService(request);
  if (isIndexingServiceFailure(service)) return service.response;
  const body = JSON.parse(service.body) as {
    message?: unknown;
    leaseOwner?: unknown;
  };
  if (!isIndexingQueueMessage(body.message))
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid request." } },
      { status: 400 },
    );
  const marked = await markQueueContinuationDispatched({
    message: body.message as IndexingQueueMessage,
    leaseOwner:
      typeof body.leaseOwner === "string" ? body.leaseOwner : undefined,
  });
  return NextResponse.json(
    { accepted: true, duplicate: !marked },
    { status: 202, headers: { "cache-control": "no-store" } },
  );
}
