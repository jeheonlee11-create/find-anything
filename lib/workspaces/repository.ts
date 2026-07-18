import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  connectors,
  memberships,
  sourceFiles,
  syncRuns,
  users,
  workspaces,
} from "@/db/schema";
import { isLocalDemoWorkspace, type AuthenticatedActor } from "@/lib/auth/api-authorization";
import { recoverStaleSyncRuns } from "@/lib/google-drive/repository";
export async function ensureUser(actor: AuthenticatedActor) {
  const db = await getDb(),
    now = new Date().toISOString();
  await db
    .insert(users)
    .values({
      id: actor.actorId,
      email: actor.email,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: actor.email, updatedAt: now },
    });
}
export async function createWorkspace(actor: AuthenticatedActor, name: string) {
  await ensureUser(actor);
  const db = await getDb(),
    now = new Date().toISOString(),
    id = `ws_${crypto.randomUUID()}`;
  await db.insert(workspaces).values({
    id,
    name,
    ownerUserId: actor.actorId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(memberships).values({
    id: `membership_${crypto.randomUUID()}`,
    workspaceId: id,
    userId: actor.actorId,
    role: "owner",
    createdAt: now,
  });
  return { id, name, role: "owner" as const, createdAt: now };
}
export async function listActorWorkspaces(actorId: string) {
  const db = await getDb();
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: memberships.role,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(eq(memberships.userId, actorId))
    .orderBy(desc(workspaces.updatedAt));
}
export async function actorWorkspace(actorId: string, workspaceId: string) {
  const db = await getDb();
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: memberships.role,
      ownerUserId: workspaces.ownerUserId,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
    .where(
      and(
        eq(memberships.userId, actorId),
        eq(memberships.workspaceId, workspaceId),
      ),
    )
    .get();
}
export async function workspaceDashboard(actorId: string, workspaceId: string) {
  const workspace = await actorWorkspace(actorId, workspaceId);
  if (!workspace) return null;
  const db = await getDb();
  const demoMode = isLocalDemoWorkspace(workspaceId);
  let connector = await db
      .select({
        id: connectors.id,
        status: connectors.status,
        lastSyncAt: connectors.lastSyncAt,
      lastErrorCode: connectors.lastErrorCode,
      grantedScopes: connectors.grantedScopes,
        updatedAt: connectors.updatedAt,
      })
      .from(connectors)
      .where(
        and(
          eq(connectors.workspaceId, workspaceId),
          eq(connectors.provider, demoMode ? "demo_fixture" : "google_drive"),
        ),
      )
      .get();
  if (connector?.status === "syncing") {
    await recoverStaleSyncRuns(connector.id, Date.now(), 30_000);
    connector = await db
      .select({
        id: connectors.id,
        status: connectors.status,
        lastSyncAt: connectors.lastSyncAt,
        lastErrorCode: connectors.lastErrorCode,
        grantedScopes: connectors.grantedScopes,
        updatedAt: connectors.updatedAt,
      })
      .from(connectors)
      .where(eq(connectors.id, connector.id))
      .get();
  }
  const files = await db
      .select({
        id: sourceFiles.id,
        name: sourceFiles.name,
        mimeType: sourceFiles.mimeType,
        modifiedAt: sourceFiles.modifiedAt,
        webViewLink: sourceFiles.webViewLink,
        indexStatus: sourceFiles.indexStatus,
        extractionError: sourceFiles.extractionError,
        extractionMode: sourceFiles.extractionMode,
        structuralFallbackReason: sourceFiles.structuralFallbackReason,
      })
      .from(sourceFiles)
      .where(
        and(
          eq(sourceFiles.workspaceId, workspaceId),
          eq(sourceFiles.trashed, false),
        ),
      )
      .orderBy(desc(sourceFiles.modifiedAt))
      .limit(200),
    latestSync = connector
      ? await db
          .select()
          .from(syncRuns)
          .where(eq(syncRuns.connectorId, connector.id))
          .orderBy(desc(syncRuns.startedAt))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : null;
  return { workspace, demoMode, connector: connector?{...connector,scopeVerified:demoMode||new Set(connector.grantedScopes.split(/\s+/)).has("https://www.googleapis.com/auth/drive.readonly" )}:null, files, latestSync };
}
