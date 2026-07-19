import { NextResponse } from "next/server";
import { rateLimit, recordBetaEvent } from "@/lib/beta/repository";

const allowed = new Set(["demo_viewed", "beta_access_clicked", "demo_booking_clicked"]);
async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`marketing-v1:${value}`)));
  return Array.from(bytes).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return new NextResponse(null, { status: 413 });
  const body = await request.json().catch(() => null) as { event?: unknown; anonymousId?: unknown; intent?: unknown } | null;
  if (!body || typeof body.event !== "string" || !allowed.has(body.event) || typeof body.anonymousId !== "string" || body.anonymousId.length > 100)
    return NextResponse.json({ accepted: false }, { status: 400 });
  const actorId = `marketing_${await digest(body.anonymousId)}`;
  if (!(await rateLimit(actorId, "marketing_event", 30, 3600))) return NextResponse.json({ accepted: false }, { status: 429 });
  await recordBetaEvent({ actorId, event: body.event, properties: typeof body.intent === "string" ? { intent: body.intent.slice(0, 10) } : {} });
  return NextResponse.json({ accepted: true }, { status: 202, headers: { "cache-control": "no-store" } });
}
