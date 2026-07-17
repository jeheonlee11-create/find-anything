import { NextResponse } from "next/server";
import { analyticsEvents, sanitizeProperties } from "@/lib/analytics/events";
import {
  isAuthFailure,
  isAuthorizationFailure,
  requireAuthenticatedUser,
  requireWorkspaceMember,
} from "@/lib/auth/authorization";
import { rateLimit, recordBetaEvent } from "@/lib/beta/repository";

export async function POST(request: Request) {
  const actor = await requireAuthenticatedUser(request);
  if (isAuthFailure(actor)) return actor;
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return NextResponse.json(
      { error: { code: "REQUEST_TOO_LARGE", message: "Analytics events are limited to 8 KB." } },
      { status: 413 },
    );
  if (!(await rateLimit(actor.actorId, "analytics", 120, 60)))
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Analytics event limit reached." } },
      { status: 429 },
    );
  const body = (await request.json().catch(() => null)) as {
      name?: string;
      properties?: Record<string, unknown>;
    } | null;
  if (!body || typeof body.name !== "string" || !analyticsEvents.includes(body.name as never))
    return NextResponse.json(
      { error: { code: "INVALID_EVENT", message: "Invalid analytics event." } },
      { status: 400 },
    );
  const properties = sanitizeProperties((body.properties ?? {}) as never),
    workspaceId = typeof properties.workspaceId === "string" ? properties.workspaceId : undefined;
  if (workspaceId) {
    const authorized = await requireWorkspaceMember(actor, workspaceId);
    if (isAuthorizationFailure(authorized)) return authorized;
  }
  await recordBetaEvent({
    actorId: actor.actorId,
    workspaceId,
    event: body.name,
    properties: properties as Record<string, string | number | boolean>,
  });
  return NextResponse.json(
    { accepted: true },
    { status: 202, headers: { "cache-control": "no-store" } },
  );
}
