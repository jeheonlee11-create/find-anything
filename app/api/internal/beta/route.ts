import { NextResponse } from "next/server";
import { requireBetaAdmin } from "@/lib/beta/admin";
import { adminUpdateIndexingJob, betaAdminData, inviteBetaUser, rateLimit, recordBetaEvent, setBetaUserStatus } from "@/lib/beta/repository";

export async function GET(request: Request) {
  const admin = await requireBetaAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await betaAdminData(), { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  const admin = await requireBetaAdmin(request);
  if (admin instanceof NextResponse) return admin;
  if (!(await rateLimit(admin.actorId, "beta_invite", 20, 3600))) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Invite limit reached. Try again later." } }, { status: 429 });
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email.includes("@") || email.length > 320) return NextResponse.json({ error: { code: "INVALID_EMAIL", message: "Enter a valid tester email." } }, { status: 400 });
  const invitation = await inviteBetaUser(email, admin.actorId);
  await recordBetaEvent({ actorId: admin.actorId, event: "user_invited" });
  return NextResponse.json({ invitation }, { status: 201, headers: { "cache-control": "no-store" } });
}
export async function PATCH(request: Request) {
  const admin = await requireBetaAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => null) as { actorId?: unknown; status?: unknown; jobId?: unknown; action?: unknown } | null;
  if (typeof body?.jobId === "string" && ["retry", "cancel", "request_reauthorization"].includes(String(body.action))) {
    const updated = await adminUpdateIndexingJob(body.jobId, body.action as "retry" | "cancel" | "request_reauthorization", admin.actorId);
    return updated ? NextResponse.json({ updated: true }) : NextResponse.json({ error: { code: "JOB_NOT_FOUND", message: "Indexing job not found." } }, { status: 404 });
  }
  if (typeof body?.actorId !== "string" || !["active", "disabled", "revoked"].includes(String(body.status))) return NextResponse.json({ error: { code: "INVALID_UPDATE", message: "Invalid beta account update." } }, { status: 400 });
  if (body.actorId === admin.actorId && body.status === "disabled") return NextResponse.json({ error: { code: "INVALID_UPDATE", message: "You cannot disable your own admin account." } }, { status: 400 });
  await setBetaUserStatus(body.actorId, body.status as "active" | "disabled" | "revoked", admin.actorId);
  return NextResponse.json({ updated: true });
}
