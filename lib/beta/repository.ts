import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  betaAnalytics,
  betaAccessAudit,
  betaFeedback,
  betaInvitations,
  betaUsers,
  operationRateLimits,
} from "@/db/schema";
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";

async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function emailHash(email: string) {
  const pepper = process.env.BETA_INVITE_PEPPER;
  if (!pepper) throw new Error("BETA_INVITE_PEPPER_MISSING");
  return digest(`${pepper}:${email.trim().toLowerCase()}`);
}
export async function betaAccess(actor: AuthenticatedActor) {
  if (process.env.NODE_ENV === "development")
    return { allowed: true, role: "admin" as const, onboardingComplete: true };
  if (process.env.BETA_ACCESS_MODE === "open-local-test")
    return { allowed: true, role: "admin" as const, onboardingComplete: true };
  if (process.env.BETA_ACCESS_MODE !== "invited")
    return { allowed: false, role: null, onboardingComplete: false };
  const db = await getDb(),
    hash = await emailHash(actor.email),
    adminEmails = (process.env.BETA_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    isAdmin = adminEmails.includes(actor.email.toLowerCase()),
    existing = await db
      .select()
      .from(betaUsers)
      .where(eq(betaUsers.actorId, actor.actorId))
      .get();
  if (existing)
    return {
      allowed: existing.status === "active",
      role: existing.role,
      onboardingComplete: Boolean(existing.onboardingCompletedAt),
    };
  const invitation = await db
    .select()
    .from(betaInvitations)
    .where(
      and(
        eq(betaInvitations.emailHash, hash),
        eq(betaInvitations.status, "approved"),
      ),
    )
    .get();
  if (
    !isAdmin &&
    (!invitation || Date.parse(invitation.expiresAt) <= Date.now())
  )
    return { allowed: false, role: null, onboardingComplete: false };
  const now = new Date().toISOString(),
    role = isAdmin ? ("admin" as const) : ("tester" as const);
  await db
    .insert(betaUsers)
    .values({
      actorId: actor.actorId,
      emailHash: hash,
      status: "active",
      role,
      invitedAt: invitation?.createdAt ?? now,
      activatedAt: now,
      onboardingCompletedAt: null,
      updatedAt: now,
    })
    .onConflictDoNothing();
  return { allowed: true, role, onboardingComplete: false };
}
export async function inviteBetaUser(email: string, adminId: string) {
  const db = await getDb(),
    now = new Date().toISOString(),
    hash = await emailHash(email),
    row = {
      id: `invite_${crypto.randomUUID()}`,
      emailHash: hash,
      status: "approved" as const,
      cohort: "private-beta-1",
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      approvedBy: adminId,
      createdAt: now,
    };
  await db
    .insert(betaInvitations)
    .values(row)
    .onConflictDoUpdate({
      target: betaInvitations.emailHash,
      set: {
        status: "approved",
        expiresAt: row.expiresAt,
        approvedBy: adminId,
      },
    });
  await db.insert(betaAccessAudit).values({ id: `audit_${crypto.randomUUID()}`, adminActorId: adminId, targetActorId: null, invitationId: row.id, action: "invitation_approved", createdAt: now });
  return { id: row.id, status: row.status, expiresAt: row.expiresAt };
}
export async function setBetaUserStatus(
  actorId: string,
  status: "active" | "disabled" | "revoked",
  adminActorId?: string,
) {
  const db = await getDb();
  await db
    .update(betaUsers)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(betaUsers.actorId, actorId));
  if (adminActorId) await db.insert(betaAccessAudit).values({ id: `audit_${crypto.randomUUID()}`, adminActorId, targetActorId: actorId, invitationId: null, action: `user_${status}`, createdAt: new Date().toISOString() });
}
export async function completeOnboarding(actorId: string) {
  const db = await getDb(),
    now = new Date().toISOString();
  await db
    .update(betaUsers)
    .set({ onboardingCompletedAt: now, updatedAt: now })
    .where(eq(betaUsers.actorId, actorId));
}
export async function saveFeedback(input: {
  actorId: string;
  workspaceId: string;
  category: string;
  query: string;
  traceId?: string | null;
  receiptId?: string | null;
  searchMode?: string | null;
  selectedResultId?: string | null;
  resultIds: string[];
  evidenceExcerpt?: string | null;
  includeEvidenceExcerpt?: boolean;
  applicationVersion?: string;
  comment: string;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    id = `feedback_${crypto.randomUUID()}`;
  await db
    .insert(betaFeedback)
    .values({
      id,
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      category: input.category,
      query: input.query.slice(0, 500),
      searchMode: input.searchMode?.slice(0, 20) ?? null,
      traceId: input.traceId ?? null,
      receiptId: input.receiptId ?? null,
      selectedResultId: input.selectedResultId ?? null,
      resultIdsJson: JSON.stringify(input.resultIds.slice(0, 100)),
      evidenceExcerpt: input.includeEvidenceExcerpt ? input.evidenceExcerpt?.slice(0, 500) ?? null : null,
      includeEvidenceExcerpt: Boolean(input.includeEvidenceExcerpt),
      applicationVersion: input.applicationVersion?.slice(0, 80) ?? "unknown",
      comment: input.comment.slice(0, 2000),
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  return id;
}
export async function recordBetaEvent(input: {
  actorId?: string;
  workspaceId?: string;
  event: string;
  properties?: Record<string, string | number | boolean>;
}) {
  const db = await getDb();
  await db
    .insert(betaAnalytics)
    .values({
      id: `event_${crypto.randomUUID()}`,
      actorId: input.actorId ?? null,
      workspaceId: input.workspaceId ?? null,
      event: input.event,
      propertiesJson: JSON.stringify(input.properties ?? {}),
      createdAt: new Date().toISOString(),
    });
}
export async function rateLimit(
  actorId: string,
  operation: string,
  limit: number,
  windowSeconds: number,
) {
  const db = await getDb(),
    windowMs = windowSeconds * 1000,
    start = new Date(
      Math.floor(Date.now() / windowMs) * windowMs,
    ).toISOString(),
    id = `${actorId}:${operation}:${start}`;
  await db
    .insert(operationRateLimits)
    .values({
      id,
      actorId,
      operation,
      windowStart: start,
      requestCount: 1,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [
        operationRateLimits.actorId,
        operationRateLimits.operation,
        operationRateLimits.windowStart,
      ],
      set: {
        requestCount: sql`${operationRateLimits.requestCount}+1`,
        updatedAt: new Date().toISOString(),
      },
    });
  const row = await db
    .select({ count: operationRateLimits.requestCount })
    .from(operationRateLimits)
    .where(eq(operationRateLimits.id, id))
    .get();
  return (row?.count ?? 1) <= limit;
}
export async function betaAdminData() {
  const db = await getDb();
  const [users, feedback, events, audit] = await Promise.all([
    db
      .select({
        actorId: betaUsers.actorId,
        status: betaUsers.status,
        role: betaUsers.role,
        activatedAt: betaUsers.activatedAt,
        onboardingCompletedAt: betaUsers.onboardingCompletedAt,
      })
      .from(betaUsers)
      .orderBy(desc(betaUsers.activatedAt))
      .limit(100),
    db
      .select()
      .from(betaFeedback)
      .orderBy(desc(betaFeedback.createdAt))
      .limit(100),
    db
      .select({ event: betaAnalytics.event, count: sql<number>`count(*)` })
      .from(betaAnalytics)
      .groupBy(betaAnalytics.event),
    db.select().from(betaAccessAudit).orderBy(desc(betaAccessAudit.createdAt)).limit(100),
  ]);
  return {
    users,
    feedback: feedback.map((row) => ({
      ...row,
      query: undefined,
      comment: row.comment,
    })),
    metrics: Object.fromEntries(
      events.map((row) => [row.event, Number(row.count)]),
    ),
    audit,
  };
}
export async function deleteBetaAnalyticsForActor(actorId: string) { const db = await getDb(); await db.delete(betaAnalytics).where(eq(betaAnalytics.actorId, actorId)); }
