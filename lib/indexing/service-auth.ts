import { NextResponse } from "next/server";
import { verifyServiceRequest } from "@/lib/indexing/queue-protocol";

export async function requireIndexingQueueService(request: Request) {
  const verified = await verifyServiceRequest(
    request,
    process.env.INDEXING_QUEUE_SERVICE_SECRET,
  );
  if (!verified.ok)
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Not found.",
          },
        },
        { status: 404, headers: { "cache-control": "no-store" } },
      ),
    };
  return { ...verified, ok: true as const };
}

export function isIndexingServiceFailure(
  value: Awaited<ReturnType<typeof requireIndexingQueueService>>,
): value is Extract<typeof value, { ok: false }> {
  return !value.ok;
}
