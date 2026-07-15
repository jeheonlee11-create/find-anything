import { NextResponse } from "next/server";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";
import { completeOnboarding, recordBetaEvent } from "@/lib/beta/repository";

export async function POST(request: Request) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  await completeOnboarding(actor.actorId);
  await recordBetaEvent({ actorId: actor.actorId, event: "user_activated" });
  return NextResponse.json({ completed: true }, { headers: { "cache-control": "no-store" } });
}
