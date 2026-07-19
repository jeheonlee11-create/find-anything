import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connectors, extractedUnits, fileVersions, memberships, retrievalConflicts, sourceFiles, syncRuns, users, workspaces } from "@/db/schema";
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";
import { BACKUP_DEMO_QUERY, DEMO_AUTHORIZED_DISCOVERED, DEMO_CONNECTOR_ID, DEMO_REMOVED_OR_UNAUTHORIZED, DEMO_WORKSPACE_ID, DEMO_WORKSPACE_NAME, PRIMARY_DEMO_QUERY, demoFiles, inaccessibleFinanceFile } from "./acme-fixture";

const SEEDED_AT = "2026-07-19T16:30:00.000Z";

export async function seedAcmeDemoWorkspace(actor: AuthenticatedActor, confirmedWorkspaceId: string) {
  if (confirmedWorkspaceId !== DEMO_WORKSPACE_ID) throw new Error("DEMO_WORKSPACE_CONFIRMATION_MISMATCH");
  const db = await getDb();
  const existing = await db.select().from(workspaces).where(eq(workspaces.id, DEMO_WORKSPACE_ID)).get();
  if (existing) {
    if (existing.ownerUserId !== actor.actorId) throw new Error("DEMO_WORKSPACE_OWNER_MISMATCH");
    return verifyAcmeDemoWorkspace(actor.actorId);
  }

  await db.insert(users).values({ id: actor.actorId, email: actor.email, createdAt: SEEDED_AT, updatedAt: SEEDED_AT }).onConflictDoUpdate({ target: users.id, set: { email: actor.email, updatedAt: SEEDED_AT } });
  await db.insert(workspaces).values({ id: DEMO_WORKSPACE_ID, name: DEMO_WORKSPACE_NAME, ownerUserId: actor.actorId, createdAt: SEEDED_AT, updatedAt: SEEDED_AT });
  await db.insert(memberships).values({ id: "membership_yc_demo", workspaceId: DEMO_WORKSPACE_ID, userId: actor.actorId, role: "owner", createdAt: SEEDED_AT });
  await db.insert(connectors).values({ id: DEMO_CONNECTOR_ID, workspaceId: DEMO_WORKSPACE_ID, actorId: actor.actorId, provider: "demo_fixture", providerAccountId: "synthetic-acme-ai", status: "connected", accessTokenCiphertext: "demo-fixture-no-token", refreshTokenCiphertext: null, tokenExpiresAt: null, grantedScopes: "demo.fixture.readonly", lastSyncAt: SEEDED_AT, lastErrorCode: null, createdAt: SEEDED_AT, updatedAt: SEEDED_AT });
  await db.insert(syncRuns).values({ id: "sync_yc_demo", connectorId: DEMO_CONNECTOR_ID, status: "partial", filesDiscovered: DEMO_AUTHORIZED_DISCOVERED, filesIndexed: demoFiles.length, filesFailed: 0, structuredFiles: demoFiles.length, fallbackFiles: 0, fallbackReasonsJson: "{}", filesAdded: demoFiles.length, filesUpdated: 0, filesUnchanged: 0, filesRemoved: DEMO_REMOVED_OR_UNAUTHORIZED, paginationComplete: true, nextPageToken: null, errorCode: "SOURCE_NO_LONGER_AUTHORIZED", startedAt: "2026-07-19T16:29:42.000Z", finishedAt: SEEDED_AT });

  for (const [index, file] of demoFiles.entries()) {
    const versionId = `demo_version_${index + 1}`, unitId = `demo_unit_${index + 1}`, contentHash = await hash(file.content);
    await db.insert(sourceFiles).values({ id: file.id, workspaceId: DEMO_WORKSPACE_ID, connectorId: DEMO_CONNECTOR_ID, sourceId: file.sourceId, name: file.name, mimeType: file.mime, ownersJson: '["Synthetic Acme AI team"]', permissionsJson: '["demo-workspace-only"]', parentsJson: "[]", modifiedAt: file.modifiedAt, webViewLink: `/app/demo/source/${file.id}`, md5Checksum: null, sizeBytes: file.content.length, trashed: false, indexStatus: "indexed", extractionError: null, extractionMode: "structured", structuralFallbackReason: null, searchableStatus: "searchable", permissionFingerprint: "demo-permission-v1", providerRevision: "demo-revision-v1", extractionVersion: "demo-structure-v1", indexingVersion: "demo-index-v1", tombstonedAt: null, lastPermissionCheckedAt: SEEDED_AT, createdAt: SEEDED_AT, updatedAt: SEEDED_AT });
    await db.insert(fileVersions).values({ id: versionId, fileId: file.id, sourceModifiedAt: file.modifiedAt, contentHash, extractionStatus: "complete", createdAt: SEEDED_AT });
    await db.insert(extractedUnits).values({ id: unitId, workspaceId: DEMO_WORKSPACE_ID, fileId: file.id, fileVersionId: versionId, unitType: file.unitType, structuralLocationJson: JSON.stringify(file.location), textContent: file.content, contentHash, createdAt: SEEDED_AT });
  }
  await db.insert(sourceFiles).values({ id: inaccessibleFinanceFile.id, workspaceId: DEMO_WORKSPACE_ID, connectorId: DEMO_CONNECTOR_ID, sourceId: inaccessibleFinanceFile.sourceId, name: inaccessibleFinanceFile.name, mimeType: inaccessibleFinanceFile.mime, ownersJson: "[]", permissionsJson: "[]", parentsJson: '["Finance"]', modifiedAt: inaccessibleFinanceFile.modifiedAt, webViewLink: null, md5Checksum: null, sizeBytes: null, trashed: true, indexStatus: "failed", extractionError: "SOURCE_NO_LONGER_AUTHORIZED", extractionMode: null, structuralFallbackReason: null, searchableStatus: "unauthorized", permissionFingerprint: "demo-permission-revoked-v1", providerRevision: "demo-revision-v1", extractionVersion: "demo-structure-v1", indexingVersion: "demo-index-v1", tombstonedAt: SEEDED_AT, lastPermissionCheckedAt: SEEDED_AT, createdAt: SEEDED_AT, updatedAt: SEEDED_AT });

  await insertConflict(db, actor.actorId, "conflict_demo_pricing", "currency_amount", 0, 1, { currency: "USD", annual: 120000, implementation: 25000 }, { currency: "USD", annual: 95000, implementation: 20000 }, "authoritative_source", { actorId: actor.actorId, authoritativeFileId: demoFiles[0].id, note: "Approved by the Acme AI executive pricing committee", decidedAt: SEEDED_AT });
  await insertConflict(db, actor.actorId, "conflict_demo_launch", "date", 3, 4, { date: "2026-09-15", status: "approved" }, { date: "2026-09-01", status: "draft" }, "unresolved", null);
  return verifyAcmeDemoWorkspace(actor.actorId);
}

export async function verifyAcmeDemoWorkspace(actorId: string) {
  const db = await getDb();
  const workspace = await db.select().from(workspaces).where(and(eq(workspaces.id, DEMO_WORKSPACE_ID), eq(workspaces.ownerUserId, actorId))).get();
  if (!workspace) throw new Error("DEMO_WORKSPACE_NOT_FOUND");
  const rows = await db.select({ id: sourceFiles.id, searchableStatus: sourceFiles.searchableStatus, extractionError: sourceFiles.extractionError }).from(sourceFiles).where(eq(sourceFiles.workspaceId, DEMO_WORKSPACE_ID));
  const indexed = rows.filter((row) => row.searchableStatus === "searchable").length;
  const inaccessible = rows.filter((row) => row.searchableStatus === "unauthorized" && row.extractionError === "SOURCE_NO_LONGER_AUTHORIZED").length;
  if (indexed !== 7 || inaccessible !== 1) throw new Error("DEMO_WORKSPACE_VERIFICATION_FAILED");
  return { workspaceId: DEMO_WORKSPACE_ID, indexed, inaccessible, primaryQuery: PRIMARY_DEMO_QUERY, launchQuery: BACKUP_DEMO_QUERY, alreadyPresent: rows.length > 0 };
}

async function insertConflict(db: Awaited<ReturnType<typeof getDb>>, actorId: string, id: string, conflictType: string, leftIndex: number, rightIndex: number, leftValue: unknown, rightValue: unknown, status: "authoritative_source" | "unresolved", decision: Record<string, unknown> | null) {
  const left = demoFiles[leftIndex], right = demoFiles[rightIndex];
  const citation = async (file: typeof left, index: number) => ({ fileId: file.id, fileName: file.name, sourceUrl: `/app/demo/source/${file.id}`, unitId: `demo_unit_${index + 1}`, unitType: file.unitType, structuralLocation: file.location, excerpt: file.content, contentHash: await hash(file.content), retrievedAt: SEEDED_AT });
  await db.insert(retrievalConflicts).values({ id, workspaceId: DEMO_WORKSPACE_ID, conflictType, detectionVersion: "deterministic-conflicts-v1", detectionMethod: conflictType === "date" ? "structured_date_comparison" : "structured_currency_comparison", leftFileId: left.id, rightFileId: right.id, leftValueJson: JSON.stringify(leftValue), rightValueJson: JSON.stringify(rightValue), leftCitationJson: JSON.stringify(await citation(left, leftIndex)), rightCitationJson: JSON.stringify(await citation(right, rightIndex)), newerFileId: left.id, relationshipInference: "The newer source supersedes an older draft, but chronology alone does not prove correctness.", reasonsJson: JSON.stringify([conflictType === "date" ? "Final and draft launch plans contain different launch dates." : "Approved and draft pricing documents contain different enterprise and implementation amounts."]), status, decisionJson: decision ? JSON.stringify({ ...decision, actorId }) : null, detectedAt: SEEDED_AT, updatedAt: SEEDED_AT, active: true });
}

async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return `sha256:${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
