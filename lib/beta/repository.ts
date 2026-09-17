import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  betaAnalytics,
  betaAccessAudit,
  betaAccessRequests,
  betaFeedback,
  betaInvitations,
  betaUsers,
  connectors,
  coverageReceipts,
  indexingFailures,
  indexingJobs,
  operationRateLimits,
} from "@/db/schema";
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";
import { decryptSecret, encryptSecret } from "@/lib/google-drive/crypto";

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
  // "open" admits every authenticated user while keeping the rest of the
  // machinery intact: admins still come from BETA_ADMIN_EMAILS, existing user
  // rows keep their role, and a suspended row still blocks access.
  const openMode = process.env.BETA_ACCESS_MODE === "open";
  if (process.env.BETA_ACCESS_MODE !== "invited" && !openMode)
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
    !openMode &&
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
export async function saveBetaAccessRequest(input: {
  email: string;
  fullName: string;
  company: string;
  jobTitle: string;
  companySize: string;
  knowledgeTools: string[];
  usesAiAgents: boolean;
  knowledgeProblem: string;
  willingLimitedFolder: boolean;
  intent: "beta" | "demo";
}) {
  const db = await getDb(), now = new Date().toISOString(), hash = await emailHash(input.email);
  const existing = await db.select({ id: betaAccessRequests.id }).from(betaAccessRequests).where(eq(betaAccessRequests.emailHash, hash)).get();
  const values = {
    emailCiphertext: await encryptSecret(input.email.trim().toLowerCase()),
    fullName: input.fullName.trim(),
    company: input.company.trim(),
    jobTitle: input.jobTitle.trim(),
    companySize: input.companySize,
    knowledgeToolsJson: JSON.stringify(input.knowledgeTools),
    usesAiAgents: input.usesAiAgents,
    knowledgeProblem: input.knowledgeProblem.trim(),
    willingLimitedFolder: input.willingLimitedFolder,
    intent: input.intent,
    updatedAt: now,
  };
  if (existing) {
    await db.update(betaAccessRequests).set(values).where(eq(betaAccessRequests.id, existing.id));
    return { id: existing.id, created: false };
  }
  const id = `access_${crypto.randomUUID()}`;
  await db.insert(betaAccessRequests).values({ id, emailHash: hash, ...values, status: "new", createdAt: now });
  return { id, created: true };
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
  const [users, accessRequests, feedback, events, audit, connectorRows, jobs, failures, coverage] = await Promise.all([
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
    db.select().from(betaAccessRequests).orderBy(desc(betaAccessRequests.createdAt)).limit(100),
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
    db.select({ id: connectors.id, workspaceId: connectors.workspaceId, status: connectors.status, lastSyncAt: connectors.lastSyncAt, lastErrorCode: connectors.lastErrorCode, updatedAt: connectors.updatedAt }).from(connectors).orderBy(desc(connectors.updatedAt)).limit(100),
    db.select({ id: indexingJobs.id, workspaceId: indexingJobs.workspaceId, connectorId: indexingJobs.connectorId, status: indexingJobs.status, processedCount: indexingJobs.processedCount, discoveredCount: indexingJobs.discoveredCount, failedCount: indexingJobs.failedCount, heartbeatAt: indexingJobs.heartbeatAt, lastErrorCode: indexingJobs.lastErrorCode, deploymentVersion: indexingJobs.deploymentVersion, startedAt: indexingJobs.startedAt, completedAt: indexingJobs.completedAt, updatedAt: indexingJobs.updatedAt }).from(indexingJobs).orderBy(desc(indexingJobs.updatedAt)).limit(100),
    db.select({ category: indexingFailures.category, retryable: indexingFailures.retryable, count: sql<number>`count(*)` }).from(indexingFailures).where(sql`${indexingFailures.resolvedAt} is null`).groupBy(indexingFailures.category, indexingFailures.retryable),
    db.select({ workspaceId: coverageReceipts.workspaceId, status: coverageReceipts.status, inventoryComplete: coverageReceipts.inventoryComplete, countsJson: coverageReceipts.countsJson, deploymentVersion: coverageReceipts.deploymentVersion, finishedAt: coverageReceipts.finishedAt }).from(coverageReceipts).orderBy(desc(coverageReceipts.finishedAt)).limit(50),
  ]);
  const searchRows = await db.select({ propertiesJson: betaAnalytics.propertiesJson }).from(betaAnalytics).where(eq(betaAnalytics.event, "search_performed")).orderBy(desc(betaAnalytics.createdAt)).limit(1000),
    parsedSearches = searchRows.map((row) => { try { return JSON.parse(row.propertiesJson) as { latencyMs?: number; zeroResults?: boolean; queryTerms?: string }; } catch { return {}; } }),
    latencies = parsedSearches.map((row) => row.latencyMs).filter((value): value is number => typeof value === "number"),
    terms = new Map<string, number>();
  for (const row of parsedSearches) for (const term of (row.queryTerms ?? "").split(" ").filter(Boolean)) terms.set(term, (terms.get(term) ?? 0) + 1);
  const finishedJobs = jobs.filter((job) => job.startedAt && job.completedAt),
    indexingDurations = finishedJobs.map((job) => Date.parse(job.completedAt!) - Date.parse(job.startedAt!)).filter((value) => Number.isFinite(value) && value >= 0);
  return {
    users,
    accessRequests: await Promise.all(accessRequests.map(async (row) => ({
      id: row.id,
      email: await decryptSecret(row.emailCiphertext).catch(() => "Unavailable"),
      fullName: row.fullName,
      company: row.company,
      jobTitle: row.jobTitle,
      companySize: row.companySize,
      knowledgeTools: JSON.parse(row.knowledgeToolsJson) as string[],
      usesAiAgents: row.usesAiAgents,
      knowledgeProblem: row.knowledgeProblem,
      willingLimitedFolder: row.willingLimitedFolder,
      intent: row.intent,
      status: row.status,
      createdAt: row.createdAt,
    }))),
    feedback: feedback.map((row) => ({
      ...row,
      query: undefined,
      comment: row.comment,
    })),
    metrics: Object.fromEntries(
      events.map((row) => [row.event, Number(row.count)]),
    ),
    insights: {
      averageSearchLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      zeroResultSearches: parsedSearches.filter((row) => row.zeroResults).length,
      averageIndexingDurationMs: indexingDurations.length ? Math.round(indexingDurations.reduce((a, b) => a + b, 0) / indexingDurations.length) : 0,
      commonQueryTerms: [...terms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10),
    },
    audit,
    connectors: connectorRows,
    jobs,
    failures: failures.map((row) => ({ ...row, count: Number(row.count) })),
    coverage,
  };
}
export async function adminUpdateIndexingJob(
  jobId: string,
  action: "retry" | "cancel" | "request_reauthorization",
  adminActorId: string,
) {
  const db = await getDb(),
    job = await db.select().from(indexingJobs).where(eq(indexingJobs.id, jobId)).get();
  if (!job) return false;
  const now = new Date().toISOString();
  if (action === "retry")
    await db.update(indexingJobs).set({ status: "queued", completedAt: null, terminalReason: null, updatedAt: now }).where(eq(indexingJobs.id, jobId));
  else if (action === "cancel")
    await db.update(indexingJobs).set({ status: "cancelled", terminalReason: "ADMIN_CANCELLED", completedAt: now, updatedAt: now }).where(eq(indexingJobs.id, jobId));
  else {
    await db.update(connectors).set({ status: "reauthorization_required", lastErrorCode: "ADMIN_REAUTHORIZATION_REQUESTED", updatedAt: now }).where(eq(connectors.id, job.connectorId));
    await db.update(indexingJobs).set({ status: "reauthorization_required", terminalReason: "ADMIN_REAUTHORIZATION_REQUESTED", completedAt: now, updatedAt: now }).where(eq(indexingJobs.id, jobId));
  }
  await db.insert(betaAccessAudit).values({
    id: `audit_${crypto.randomUUID()}`,
    adminActorId,
    targetActorId: null,
    invitationId: null,
    action: `indexing_job_${action}:${jobId}`,
    createdAt: now,
  });
  return true;
}
export async function deleteBetaAnalyticsForActor(actorId: string) { const db = await getDb(); await db.delete(betaAnalytics).where(eq(betaAnalytics.actorId, actorId)); }
