import { NextResponse } from "next/server";
import {
  isIndexingServiceFailure,
  requireIndexingQueueService,
} from "@/lib/indexing/service-auth";
import { leaseDueIndexingContinuations } from "@/lib/indexing/jobs";

export async function POST(request: Request) {
  const service = await requireIndexingQueueService(request);
  if (isIndexingServiceFailure(service)) return service.response;
  const body = JSON.parse(service.body) as {
    leaseOwner?: unknown;
    limit?: unknown;
  };
  if (typeof body.leaseOwner !== "string" || body.leaseOwner.length > 120)
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid request." } },
      { status: 400 },
    );
  const messages = await leaseDueIndexingContinuations({
    leaseOwner: body.leaseOwner,
    limit:
      typeof body.limit === "number" && Number.isSafeInteger(body.limit)
        ? body.limit
        : 25,
  });
  return NextResponse.json(
    { messages },
    { headers: { "cache-control": "no-store" } },
  );
}
