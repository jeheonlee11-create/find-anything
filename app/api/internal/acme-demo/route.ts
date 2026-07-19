import { NextResponse } from "next/server";
import { requireBetaAdmin } from "@/lib/beta/admin";
import { seedAcmeDemoWorkspace } from "@/lib/demo/production-seed";
import { DEMO_WORKSPACE_ID } from "@/lib/demo/acme-fixture";

export async function POST(request: Request) {
  const actor = await requireBetaAdmin(request);
  if (actor instanceof NextResponse) return actor;
  const body = await request.json().catch(() => null) as { confirmWorkspaceId?: unknown } | null;
  if (body?.confirmWorkspaceId !== DEMO_WORKSPACE_ID)
    return NextResponse.json({ error: { code: "DEMO_WORKSPACE_CONFIRMATION_REQUIRED", message: "Confirm the dedicated Acme AI workspace before seeding." } }, { status: 400 });
  try {
    return NextResponse.json(await seedAcmeDemoWorkspace(actor, DEMO_WORKSPACE_ID), { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: { code: "DEMO_SEED_FAILED", message: "The controlled demo seed did not complete." } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
