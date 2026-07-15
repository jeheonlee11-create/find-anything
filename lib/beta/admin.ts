import { NextResponse } from "next/server";
import { betaAccess } from "@/lib/beta/repository";
import { isAuthFailure, requireApiActor } from "@/lib/auth/api-authorization";

export async function requireBetaAdmin(request: Request) {
  const actor = await requireApiActor(request);
  if (isAuthFailure(actor)) return actor;
  const access = await betaAccess(actor);
  if (access.role !== "admin") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  return actor;
}
