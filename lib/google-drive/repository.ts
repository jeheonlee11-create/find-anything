import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db";
import {
  connectors,
  extractedUnits,
  fileVersions,
  indexingFailures,
  memberships,
  oauthRefreshLeases,
  oauthStates,
  sourceFiles,
  syncRuns,
  users,
  workspaces,
} from "@/db/schema";
import { classifyIndexingFailure } from "@/lib/indexing/failures";
import type { AuthenticatedActor } from "@/lib/auth/api-authorization";
import {
  isStaleSync,
  reconcileInterruptedRun,
} from "@/lib/google-drive/sync-lifecycle";
export function actorWorkspaceId(actorId: string) {
  return `ws_${actorId.slice("actor_".length)}`;
}
// Cloudflare D1 batches stay well under platform limits: at most 40 statements
// per db.batch and at most ~100 bound parameters per statement.
export const DB_BATCH_MAX_STATEMENTS = 40;
const METADATA_ROWS_PER_STATEMENT = 3;
const UNIT_ROWS_PER_STATEMENT = 12;
const RETRY_IDS_PER_STATEMENT = 90;
type SqliteBatch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
async function runBatchChunks(
  db: Awaited<ReturnType<typeof getDb>>,
  statements: BatchItem<"sqlite">[],
) {
  for (
    let offset = 0;
    offset < statements.length;
    offset += DB_BATCH_MAX_STATEMENTS
  ) {
    const chunk = statements.slice(offset, offset + DB_BATCH_MAX_STATEMENTS);
    if (chunk.length) await db.batch(chunk as SqliteBatch);
  }
}
export interface DriveMetadataFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
  owners?: unknown[];
  permissions?: unknown[];
  webViewLink?: string;
  md5Checksum?: string;
  size?: string;
  trashed?: boolean;
}
export async function persistDiscoveredFileMetadata(input: {
  connectorId: string;
  workspaceId: string;
  files: DriveMetadataFile[];
}) {
  if (!input.files.length) return 0;
  const db = await getDb(),
    now = new Date().toISOString(),
    statements: BatchItem<"sqlite">[] = [];
  for (
    let offset = 0;
    offset < input.files.length;
    offset += METADATA_ROWS_PER_STATEMENT
  ) {
    const rows = await Promise.all(
      input.files
        .slice(offset, offset + METADATA_ROWS_PER_STATEMENT)
        .map(async (file) => ({
          id: `gdrive_${await shortHash(`${input.connectorId}:${file.id}`)}`,
          workspaceId: input.workspaceId,
          connectorId: input.connectorId,
          sourceId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          ownersJson: JSON.stringify(file.owners ?? []),
          permissionsJson: JSON.stringify(file.permissions ?? []),
          parentsJson: JSON.stringify(file.parents ?? []),
          modifiedAt: file.modifiedTime,
          webViewLink: validatedGoogleSourceUrl(file.webViewLink),
          md5Checksum: file.md5Checksum,
          sizeBytes: file.size ? Number(file.size) : null,
          trashed: Boolean(file.trashed),
          indexStatus: "metadata" as const,
          searchableStatus: "searchable" as const,
          lastPermissionCheckedAt: now,
          createdAt: now,
          updatedAt: now,
        })),
    );
    statements.push(
      db
        .insert(sourceFiles)
        .values(rows)
        .onConflictDoUpdate({
          target: [sourceFiles.connectorId, sourceFiles.sourceId],
          // Metadata-only refresh: keep modified_at, md5_checksum, index_status,
          // retry_count, searchable_status, and extraction fields untouched so
          // change detection and per-file failure state stay honest.
          set: {
            name: sql`excluded.name`,
            mimeType: sql`excluded.mime_type`,
            ownersJson: sql`excluded.owners_json`,
            permissionsJson: sql`excluded.permissions_json`,
            parentsJson: sql`excluded.parents_json`,
            webViewLink: sql`excluded.web_view_link`,
            sizeBytes: sql`excluded.size_bytes`,
            trashed: sql`excluded.trashed`,
            lastPermissionCheckedAt: sql`excluded.last_permission_checked_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        }),
    );
  }
  await runBatchChunks(db, statements);
  return input.files.length;
}
export async function refreshFileMetadataBatch(input: {
  connectorId: string;
  files: DriveMetadataFile[];
}) {
  if (!input.files.length) return 0;
  const db = await getDb(),
    now = new Date().toISOString(),
    statements = input.files.map((file) =>
      db
        .update(sourceFiles)
        .set({
          name: file.name,
          mimeType: file.mimeType,
          ownersJson: JSON.stringify(file.owners ?? []),
          permissionsJson: JSON.stringify(file.permissions ?? []),
          parentsJson: JSON.stringify(file.parents ?? []),
          modifiedAt: file.modifiedTime,
          webViewLink: validatedGoogleSourceUrl(file.webViewLink),
          md5Checksum: file.md5Checksum,
          sizeBytes: file.size ? Number(file.size) : null,
          trashed: Boolean(file.trashed),
          lastPermissionCheckedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(sourceFiles.connectorId, input.connectorId),
            eq(sourceFiles.sourceId, file.id),
          ),
        ),
    );
  await runBatchChunks(db, statements);
  return input.files.length;
}
export async function recordFileRetryAttempts(
  connectorId: string,
  sourceIds: string[],
) {
  if (!sourceIds.length) return;
  const db = await getDb(),
    now = new Date().toISOString(),
    statements: BatchItem<"sqlite">[] = [];
  for (
    let offset = 0;
    offset < sourceIds.length;
    offset += RETRY_IDS_PER_STATEMENT
  )
    statements.push(
      db
        .update(sourceFiles)
        .set({
          retryCount: sql`${sourceFiles.retryCount} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(sourceFiles.connectorId, connectorId),
            inArray(
              sourceFiles.sourceId,
              sourceIds.slice(offset, offset + RETRY_IDS_PER_STATEMENT),
            ),
          ),
        ),
    );
  await runBatchChunks(db, statements);
}
export async function latestSyncForConnector(connectorId: string) {
  const db = await getDb();
  return db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.connectorId, connectorId))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}
export async function ensureActorWorkspace(actor: AuthenticatedActor) {
  const db = await getDb(),
    now = new Date().toISOString(),
    workspaceId = actorWorkspaceId(actor.actorId);
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
  await db
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: "My workspace",
      ownerUserId: actor.actorId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(memberships)
    .values({
      id: `member_${actor.actorId}`,
      workspaceId,
      userId: actor.actorId,
      role: "owner",
      createdAt: now,
    })
    .onConflictDoNothing();
  return workspaceId;
}
export async function saveOAuthState(input: {
  stateHash: string;
  actorId: string;
  workspaceId: string;
  pkceVerifierCiphertext: string;
  expiresAt: string;
}) {
  const db = await getDb(),
    createdAt = new Date().toISOString();
  await db.insert(oauthStates).values({ ...input, createdAt });
}
export async function consumeOAuthState(stateHash: string) {
  const db = await getDb();
  const row = await db
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.stateHash, stateHash))
    .get();
  if (row)
    await db.delete(oauthStates).where(eq(oauthStates.stateHash, stateHash));
  return row;
}
export async function upsertConnector(input: typeof connectors.$inferInsert) {
  const db = await getDb();
  await db
    .insert(connectors)
    .values(input)
    .onConflictDoUpdate({
      target: [connectors.workspaceId, connectors.provider],
      set: {
        actorId: input.actorId,
        providerAccountId: input.providerAccountId,
        status: input.status,
        accessTokenCiphertext: input.accessTokenCiphertext,
        ...(input.refreshTokenCiphertext
          ? { refreshTokenCiphertext: input.refreshTokenCiphertext }
          : {}),
        tokenExpiresAt: input.tokenExpiresAt,
        grantedScopes: input.grantedScopes,
        lastErrorCode: null,
        updatedAt: input.updatedAt,
      },
    });
  return db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.workspaceId, input.workspaceId),
        eq(connectors.provider, input.provider),
      ),
    )
    .get();
}
export async function connectorForActor(
  actor: AuthenticatedActor,
  workspaceId: string,
  provider = "google_drive",
) {
  const db = await getDb();
  return db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.workspaceId, workspaceId),
        eq(connectors.actorId, actor.actorId),
        eq(connectors.provider, provider),
      ),
    )
    .get();
}
export async function connectorForWorkspace(workspaceId: string, provider = "google_drive") {
  const db = await getDb();
  return db
    .select()
    .from(connectors)
    .where(
      and(
        eq(connectors.workspaceId, workspaceId),
        eq(connectors.provider, provider),
      ),
    )
    .get();
}
export async function existingSourceFile(
  connectorId: string,
  sourceId: string,
) {
  const db = await getDb();
  return db
    .select({
      id: sourceFiles.id,
      modifiedAt: sourceFiles.modifiedAt,
      indexStatus: sourceFiles.indexStatus,
      extractionMode: sourceFiles.extractionMode,
    })
    .from(sourceFiles)
    .where(
      and(
        eq(sourceFiles.connectorId, connectorId),
        eq(sourceFiles.sourceId, sourceId),
      ),
    )
    .get();
}
export async function existingSourceFiles(connectorId: string) {
  const db = await getDb();
  return db
    .select({
      sourceId: sourceFiles.sourceId,
      modifiedAt: sourceFiles.modifiedAt,
      indexStatus: sourceFiles.indexStatus,
      extractionMode: sourceFiles.extractionMode,
      // The stored content hash for hash-based duplicate detection: Drive's
      // md5Checksum recorded the last time this file's content was persisted.
      contentHash: sourceFiles.md5Checksum,
      retryCount: sourceFiles.retryCount,
    })
    .from(sourceFiles)
    .where(
      and(
        eq(sourceFiles.connectorId, connectorId),
        eq(sourceFiles.trashed, false),
      ),
    );
}
export async function updateConnectorTokens(
  id: string,
  input: {
    accessTokenCiphertext: string;
    refreshTokenCiphertext?: string | null;
    tokenExpiresAt: string;
  },
) {
  const db = await getDb();
  await db
    .update(connectors)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(connectors.id, id));
}
export async function acquireTokenRefreshLease(connectorId: string) {
  const db = await getDb(),
    now = new Date().toISOString(),
    ownerId = crypto.randomUUID();
  await db
    .delete(oauthRefreshLeases)
    .where(lt(oauthRefreshLeases.expiresAt, now));
  await db
    .insert(oauthRefreshLeases)
    .values({
      connectorId,
      ownerId,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      createdAt: now,
    })
    .onConflictDoNothing();
  const lease = await db
    .select()
    .from(oauthRefreshLeases)
    .where(eq(oauthRefreshLeases.connectorId, connectorId))
    .get();
  return lease?.ownerId === ownerId ? ownerId : null;
}
export async function releaseTokenRefreshLease(
  connectorId: string,
  ownerId: string,
) {
  const db = await getDb();
  await db
    .delete(oauthRefreshLeases)
    .where(
      and(
        eq(oauthRefreshLeases.connectorId, connectorId),
        eq(oauthRefreshLeases.ownerId, ownerId),
      ),
    );
}
export async function refreshedConnectorToken(connectorId: string) {
  const db = await getDb();
  return db
    .select({
      status: connectors.status,
      accessTokenCiphertext: connectors.accessTokenCiphertext,
      tokenExpiresAt: connectors.tokenExpiresAt,
      lastErrorCode: connectors.lastErrorCode,
    })
    .from(connectors)
    .where(eq(connectors.id, connectorId))
    .get();
}
export async function setConnectorStatus(
  id: string,
  status:
    | "connected"
    | "token_refreshing"
    | "reauthorization_required"
    | "syncing"
    | "error"
    | "revoked",
  lastErrorCode: string | null = null,
  recordSuccessfulSync = true,
) {
  const db = await getDb();
  await db
    .update(connectors)
    .set({
      status,
      lastErrorCode,
      lastSyncAt:
        status === "connected" && recordSuccessfulSync
          ? new Date().toISOString()
          : undefined,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(connectors.id, id));
}
export async function beginSync(
  connectorId: string,
  recoverInterrupted = false,
) {
  await recoverStaleSyncRuns(
    connectorId,
    Date.now(),
    recoverInterrupted ? 0 : undefined,
  );
  const db = await getDb(),
    active = await db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(
        and(
          eq(syncRuns.connectorId, connectorId),
          eq(syncRuns.status, "running"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  if (active) throw new Error("GOOGLE_SYNC_ALREADY_RUNNING");
  const id = `sync_${crypto.randomUUID()}`,
    startedAt = new Date().toISOString();
  await db.insert(syncRuns).values({
    id,
    connectorId,
    status: "running",
    filesDiscovered: 0,
    filesIndexed: 0,
    filesFailed: 0,
    startedAt,
  });
  return id;
}
export async function finishSync(
  id: string,
  input: {
    status: "complete" | "partial" | "failed";
    filesDiscovered: number;
    filesIndexed: number;
    filesFailed: number;
    structuredFiles?: number;
    fallbackFiles?: number;
    fallbackReasonsJson?: string;
    filesAdded?: number;
    filesUpdated?: number;
    filesUnchanged?: number;
    filesRemoved?: number;
    paginationComplete?: boolean;
    errorCode?: string;
  },
) {
  const db = await getDb();
  await db
    .update(syncRuns)
    .set({
      ...input,
      errorCode: input.errorCode ?? null,
      finishedAt: new Date().toISOString(),
    })
    .where(eq(syncRuns.id, id));
}
export async function checkpointSync(
  id: string,
  input: Partial<{
    filesDiscovered: number;
    filesIndexed: number;
    filesFailed: number;
    structuredFiles: number;
    fallbackFiles: number;
    fallbackReasonsJson: string;
    filesAdded: number;
    filesUpdated: number;
    filesUnchanged: number;
    filesRemoved: number;
    paginationComplete: boolean;
    nextPageToken: string | null;
  }>,
) {
  const db = await getDb();
  await db.update(syncRuns).set(input).where(eq(syncRuns.id, id));
}
export async function recoverStaleSyncRuns(
  connectorId: string,
  now = Date.now(),
  staleAfterMs?: number,
) {
  const db = await getDb(),
    runs = await db
      .select()
      .from(syncRuns)
      .where(
        and(
          eq(syncRuns.connectorId, connectorId),
          eq(syncRuns.status, "running"),
        ),
      )
      .orderBy(desc(syncRuns.startedAt)),
    stale = runs.filter((run) =>
      isStaleSync(run.startedAt, now, staleAfterMs),
    );
  if (!stale.length) return 0;
  const rows = await db
      .select({
        indexStatus: sourceFiles.indexStatus,
        extractionMode: sourceFiles.extractionMode,
        trashed: sourceFiles.trashed,
      })
      .from(sourceFiles)
      .where(eq(sourceFiles.connectorId, connectorId));
  for (const run of stale) {
    const reconciled = reconcileInterruptedRun(run, rows);
    await finishSync(run.id, {
      ...reconciled,
      fallbackReasonsJson: run.fallbackReasonsJson,
      filesAdded: run.filesAdded,
      filesUpdated: run.filesUpdated,
      filesUnchanged: run.filesUnchanged,
      filesRemoved: run.filesRemoved,
      paginationComplete: run.paginationComplete,
      errorCode: "SYNC_INTERRUPTED_RECOVERED",
    });
  }
  if (stale.length === runs.length)
    await db
      .update(connectors)
      .set({
        status: "connected",
        lastErrorCode: "SYNC_INTERRUPTED_RECOVERED",
        updatedAt: new Date(now).toISOString(),
      })
      .where(eq(connectors.id, connectorId));
  return stale.length;
}
export async function persistExtractedFile(input: {
  connectorId: string;
  workspaceId: string;
  file: {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    parents?: string[];
    owners?: unknown[];
    permissions?: unknown[];
    webViewLink?: string;
    md5Checksum?: string;
    size?: string;
    trashed?: boolean;
  };
  units: {
    unitType: string;
    location: Record<string, unknown>;
    text: string;
    contentHash: string;
  }[];
  extractionMode?:
    | "structured"
    | "fallback"
    | "native"
    | "unsupported"
    | "ai_enriched";
  structuralFallbackReason?: string | null;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    fileId = `gdrive_${await shortHash(`${input.connectorId}:${input.file.id}`)}`,
    combinedHash =
      input.units.map((unit) => unit.contentHash).join(":") ||
      input.file.md5Checksum ||
      input.file.modifiedTime,
    versionId = `ver_${await shortHash(`${fileId}:${combinedHash}`)}`;
  // One file's version + units + status land through a single transactional
  // db.batch (chunked only for pathological unit counts, with the status flip
  // ordered last) — this is the per-file durable checkpoint.
  const statements: BatchItem<"sqlite">[] = [];
  if (input.units.length) {
    statements.push(
      db
        .insert(fileVersions)
        .values({
          id: versionId,
          fileId,
          sourceModifiedAt: input.file.modifiedTime,
          contentHash: combinedHash,
          extractionStatus: "complete",
          createdAt: now,
        })
        .onConflictDoNothing(),
      db.delete(extractedUnits).where(eq(extractedUnits.fileId, fileId)),
    );
    for (
      let offset = 0;
      offset < input.units.length;
      offset += UNIT_ROWS_PER_STATEMENT
    )
      statements.push(
        db.insert(extractedUnits).values(
          input.units
            .slice(offset, offset + UNIT_ROWS_PER_STATEMENT)
            .map((unit, chunkIndex) => ({
              id: `unit_${versionId}_${offset + chunkIndex}`,
              workspaceId: input.workspaceId,
              fileId,
              fileVersionId: versionId,
              unitType: unit.unitType,
              structuralLocationJson: JSON.stringify(unit.location),
              textContent: unit.text,
              contentHash: unit.contentHash,
              createdAt: now,
            })),
        ),
      );
  }
  statements.push(
    db
      .insert(sourceFiles)
      .values({
        id: fileId,
        workspaceId: input.workspaceId,
        connectorId: input.connectorId,
        sourceId: input.file.id,
        name: input.file.name,
        mimeType: input.file.mimeType,
        ownersJson: JSON.stringify(input.file.owners ?? []),
        permissionsJson: JSON.stringify(input.file.permissions ?? []),
        parentsJson: JSON.stringify(input.file.parents ?? []),
        modifiedAt: input.file.modifiedTime,
        webViewLink: validatedGoogleSourceUrl(input.file.webViewLink),
        md5Checksum: input.file.md5Checksum,
        sizeBytes: input.file.size ? Number(input.file.size) : null,
        trashed: Boolean(input.file.trashed),
        indexStatus: input.units.length ? "indexed" : "unsupported",
        retryCount: 0,
        extractionError: null,
        extractionMode: input.extractionMode ?? null,
        structuralFallbackReason: input.structuralFallbackReason ?? null,
        searchableStatus: input.units.length ? "searchable" : "hidden",
        extractionVersion: "structural-v1",
        indexingVersion: "literal-v1",
        tombstonedAt: null,
        lastPermissionCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [sourceFiles.connectorId, sourceFiles.sourceId],
        set: {
          name: input.file.name,
          mimeType: input.file.mimeType,
          ownersJson: JSON.stringify(input.file.owners ?? []),
          permissionsJson: JSON.stringify(input.file.permissions ?? []),
          parentsJson: JSON.stringify(input.file.parents ?? []),
          modifiedAt: input.file.modifiedTime,
          webViewLink: validatedGoogleSourceUrl(input.file.webViewLink),
          md5Checksum: input.file.md5Checksum,
          sizeBytes: input.file.size ? Number(input.file.size) : null,
          trashed: Boolean(input.file.trashed),
          indexStatus: input.units.length ? "indexed" : "unsupported",
          retryCount: 0,
          extractionError: null,
          extractionMode: input.extractionMode ?? null,
          structuralFallbackReason: input.structuralFallbackReason ?? null,
          searchableStatus: input.units.length ? "searchable" : "hidden",
          extractionVersion: "structural-v1",
          indexingVersion: "literal-v1",
          tombstonedAt: null,
          lastPermissionCheckedAt: now,
          updatedAt: now,
        },
      }),
  );
  await runBatchChunks(db, statements);
  return {
    fileId,
    unitIds: input.units.map((_, index) => `unit_${versionId}_${index}`),
  };
}
export async function reconcileMissingSourceFiles(
  connectorId: string,
  currentSourceIds: Set<string>,
) {
  const db = await getDb(),
    rows = await db
      .select({ id: sourceFiles.id, sourceId: sourceFiles.sourceId })
      .from(sourceFiles)
      .where(
        and(
          eq(sourceFiles.connectorId, connectorId),
          eq(sourceFiles.trashed, false),
        ),
      ),
    missing = rows.filter((row) => !currentSourceIds.has(row.sourceId));
  if (!missing.length) return 0;
  for (const row of missing) {
    await db
      .update(sourceFiles)
      .set({
        trashed: true,
        indexStatus: "failed",
        extractionError: "SOURCE_NO_LONGER_AUTHORIZED",
        searchableStatus: "unauthorized",
        tombstonedAt: new Date().toISOString(),
        lastPermissionCheckedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(sourceFiles.id, row.id),
          eq(sourceFiles.connectorId, connectorId),
        ),
      );
    await db.delete(extractedUnits).where(eq(extractedUnits.fileId, row.id));
  }
  return missing.length;
}
export async function markFileFailed(input: {
  connectorId: string;
  workspaceId: string;
  file: {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    parents?: string[];
    owners?: unknown[];
    permissions?: unknown[];
    webViewLink?: string;
    md5Checksum?: string;
    size?: string;
    trashed?: boolean;
  };
  errorCode: string;
}) {
  const db = await getDb(),
    now = new Date().toISOString(),
    fileId = `gdrive_${await shortHash(`${input.connectorId}:${input.file.id}`)}`;
  await db
    .insert(sourceFiles)
    .values({
      id: fileId,
      workspaceId: input.workspaceId,
      connectorId: input.connectorId,
      sourceId: input.file.id,
      name: input.file.name,
      mimeType: input.file.mimeType,
      ownersJson: JSON.stringify(input.file.owners ?? []),
      permissionsJson: JSON.stringify(input.file.permissions ?? []),
      parentsJson: JSON.stringify(input.file.parents ?? []),
      modifiedAt: input.file.modifiedTime,
      webViewLink: validatedGoogleSourceUrl(input.file.webViewLink),
      md5Checksum: input.file.md5Checksum,
      sizeBytes: input.file.size ? Number(input.file.size) : null,
      trashed: Boolean(input.file.trashed),
      indexStatus: "failed",
      extractionError: input.errorCode,
      searchableStatus: "hidden",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sourceFiles.connectorId, sourceFiles.sourceId],
      set: {
        indexStatus: "failed",
        extractionError: input.errorCode,
        searchableStatus: "hidden",
        updatedAt: now,
      },
    });
  const classified = classifyIndexingFailure(input.errorCode);
  await db
    .insert(indexingFailures)
    .values({
      id: `failure_${await shortHash(`${input.connectorId}:${input.file.id}:${classified.category}`)}`,
      workspaceId: input.workspaceId,
      connectorId: input.connectorId,
      providerFileId: input.file.id,
      sanitizedFileName: input.file.name.slice(0, 240),
      mimeType: input.file.mimeType,
      category: classified.category,
      retryable: classified.retryable,
      userExplanation: classified.explanation,
      diagnosticCode: input.errorCode.slice(0, 100),
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [
        indexingFailures.connectorId,
        indexingFailures.providerFileId,
        indexingFailures.category,
      ],
      set: {
        retryable: classified.retryable,
        userExplanation: classified.explanation,
        diagnosticCode: input.errorCode.slice(0, 100),
        lastSeenAt: now,
        attemptCount: sql`${indexingFailures.attemptCount} + 1`,
        resolvedAt: null,
      },
    });
}
export async function deleteConnectorData(
  connectorId: string,
  workspaceId: string,
) {
  const db = await getDb(),
    files = await db
      .select({ id: sourceFiles.id })
      .from(sourceFiles)
      .where(eq(sourceFiles.connectorId, connectorId));
  await db
    .delete(extractedUnits)
    .where(eq(extractedUnits.workspaceId, workspaceId));
  for (const file of files)
    await db.delete(fileVersions).where(eq(fileVersions.fileId, file.id));
  await db.delete(sourceFiles).where(eq(sourceFiles.connectorId, connectorId));
  await db.delete(syncRuns).where(eq(syncRuns.connectorId, connectorId));
  await db.delete(connectors).where(eq(connectors.id, connectorId));
}
async function shortHash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function validatedGoogleSourceUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const allowed = new Set([
      "drive.google.com",
      "docs.google.com",
      "sheets.google.com",
      "slides.google.com",
    ]);
    return allowed.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}
