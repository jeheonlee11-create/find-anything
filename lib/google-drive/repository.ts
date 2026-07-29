import { and, count, desc, eq, lt, sql } from "drizzle-orm";
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
import { D1_MAX_STATEMENTS_PER_BATCH } from "@/lib/indexing/d1-limits";
import type { SubrequestBudget } from "@/lib/indexing/subrequest-budget";
import {
  discoveredMetadataStatements,
  extractedFileStatements,
  metadataRefreshStatements,
  retryAttemptStatements,
  type SqliteStatement,
  type StatementDb,
} from "@/lib/google-drive/statement-builders";
export function actorWorkspaceId(actorId: string) {
  return `ws_${actorId.slice("actor_".length)}`;
}
// Cloudflare D1 batches stay well under platform limits: at most 40 statements
// per db.batch and at most 99 bound parameters per statement. Multi-row
// statement sizing lives in lib/indexing/d1-limits.ts and is derived from
// db/schema.ts, so a new column shrinks the chunk instead of overflowing.
export const DB_BATCH_MAX_STATEMENTS = D1_MAX_STATEMENTS_PER_BATCH;
type SqliteBatch = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
/** Every D1 round trip is a Workers subrequest; charge the hop budget for it. */
type BudgetOption = { budget?: Pick<SubrequestBudget, "spend"> };
async function runBatchChunks(
  db: Awaited<ReturnType<typeof getDb>>,
  statements: SqliteStatement[],
  budget?: Pick<SubrequestBudget, "spend">,
) {
  for (
    let offset = 0;
    offset < statements.length;
    offset += DB_BATCH_MAX_STATEMENTS
  ) {
    const chunk = statements.slice(offset, offset + DB_BATCH_MAX_STATEMENTS);
    if (chunk.length) {
      budget?.spend(1);
      await db.batch(chunk as SqliteBatch);
    }
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
export async function persistDiscoveredFileMetadata(
  input: {
    connectorId: string;
    workspaceId: string;
    files: DriveMetadataFile[];
  } & BudgetOption,
) {
  if (!input.files.length) return 0;
  const db = await getDb(),
    now = new Date().toISOString(),
    rows = await Promise.all(
      input.files.map(async (file) => ({
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
        // md5_checksum is the record of content we ACTUALLY extracted and
        // persisted, so discovery must never populate it. Writing Drive's
        // checksum here made never-indexed files look like content duplicates
        // and let them be skipped forever.
        md5Checksum: null,
        sizeBytes: file.size ? Number(file.size) : null,
        trashed: Boolean(file.trashed),
        indexStatus: "metadata" as const,
        searchableStatus: "searchable" as const,
        lastPermissionCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
  // Metadata-only refresh: keep modified_at, md5_checksum, index_status,
  // retry_count, searchable_status, and extraction fields untouched so change
  // detection and per-file failure state stay honest.
  await runBatchChunks(
    db,
    discoveredMetadataStatements(db as StatementDb, rows),
    input.budget,
  );
  return rows.length;
}
export async function refreshFileMetadataBatch(
  input: {
    connectorId: string;
    files: DriveMetadataFile[];
  } & BudgetOption,
) {
  if (!input.files.length) return 0;
  const db = await getDb(),
    now = new Date().toISOString(),
    updates = input.files.map((file) => ({
      sourceId: file.id,
      values: {
        name: file.name,
        mimeType: file.mimeType,
        ownersJson: JSON.stringify(file.owners ?? []),
        permissionsJson: JSON.stringify(file.permissions ?? []),
        parentsJson: JSON.stringify(file.parents ?? []),
        modifiedAt: file.modifiedTime,
        webViewLink: validatedGoogleSourceUrl(file.webViewLink),
        // Never touches md5_checksum: a metadata refresh persists no content.
        sizeBytes: file.size ? Number(file.size) : null,
        trashed: Boolean(file.trashed),
        lastPermissionCheckedAt: now,
        updatedAt: now,
      },
    }));
  await runBatchChunks(
    db,
    metadataRefreshStatements(db as StatementDb, {
      connectorId: input.connectorId,
      updates,
    }),
    input.budget,
  );
  return input.files.length;
}
/**
 * Charge the per-file retry budget. Called for files that are genuinely being
 * attempted, one attempt at a time — never speculatively for a whole candidate
 * list, which used to burn MAX_FILE_RETRIES without a single re-extraction.
 */
export async function recordFileRetryAttempts(
  connectorId: string,
  sourceIds: string[],
  budget?: Pick<SubrequestBudget, "spend">,
) {
  if (!sourceIds.length) return;
  const db = await getDb(),
    now = new Date().toISOString();
  await runBatchChunks(
    db,
    retryAttemptStatements(db as StatementDb, {
      connectorId,
      sourceIds,
      now,
    }),
    budget,
  );
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
      // Content hash for duplicate detection. `persistExtractedFile` writes it
      // in the SAME transactional batch that commits the file_versions row
      // (extraction_status complete) and flips index_status to `indexed`, and
      // nothing else ever writes it — so `indexStatus === "indexed"` together
      // with this hash means content really was extracted and persisted.
      contentHash: sourceFiles.md5Checksum,
      retryCount: sourceFiles.retryCount,
      // Lets change detection tell "unchanged since a PRIOR sync" apart from
      // "this job already indexed it a few hops ago".
      updatedAt: sourceFiles.updatedAt,
    })
    .from(sourceFiles)
    .where(
      and(
        eq(sourceFiles.connectorId, connectorId),
        eq(sourceFiles.trashed, false),
      ),
    );
}
/** Committed metadata rows — the honest source for `metadataIndexedCount`. */
export async function countConnectorSourceFiles(connectorId: string) {
  const db = await getDb(),
    row = await db
      .select({ value: count() })
      .from(sourceFiles)
      .where(
        and(
          eq(sourceFiles.connectorId, connectorId),
          eq(sourceFiles.trashed, false),
        ),
      )
      .get();
  return row?.value ?? 0;
}
/**
 * The durable discovery cursor: the newest run's saved `next_page_token` plus
 * the files it had already discovered. A budget- or deadline-limited discovery
 * hop checkpoints here and the next hop resumes at the token instead of
 * re-listing from page 1 — which is what made large drives unable to finish.
 */
export async function latestDiscoveryCheckpoint(connectorId: string) {
  const db = await getDb(),
    run = await db
      .select({
        nextPageToken: syncRuns.nextPageToken,
        filesDiscovered: syncRuns.filesDiscovered,
        paginationComplete: syncRuns.paginationComplete,
      })
      .from(syncRuns)
      .where(eq(syncRuns.connectorId, connectorId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1)
      .get();
  if (!run || run.paginationComplete || !run.nextPageToken) return null;
  return {
    pageToken: run.nextPageToken,
    discoveredBefore: Math.max(0, run.filesDiscovered),
  };
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
    nextPageToken?: string | null;
    errorCode?: string;
  },
  budget?: Pick<SubrequestBudget, "spend">,
) {
  const db = await getDb();
  budget?.spend(1);
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
  budget?: Pick<SubrequestBudget, "spend">,
) {
  const db = await getDb();
  budget?.spend(1);
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
} & BudgetOption) {
  const db = await getDb(),
    now = new Date().toISOString(),
    fileId = `gdrive_${await shortHash(`${input.connectorId}:${input.file.id}`)}`,
    combinedHash =
      input.units.map((unit) => unit.contentHash).join(":") ||
      input.file.md5Checksum ||
      input.file.modifiedTime,
    versionId = `ver_${await shortHash(`${fileId}:${combinedHash}`)}`,
    indexed = input.units.length > 0,
    // Only a persisted extraction may record the provider checksum: this is
    // the value duplicate detection compares against, and it is committed in
    // the same batch as the file_versions row and the `indexed` status flip.
    persistedChecksum = indexed ? (input.file.md5Checksum ?? null) : null,
    statusFields = {
      name: input.file.name,
      mimeType: input.file.mimeType,
      ownersJson: JSON.stringify(input.file.owners ?? []),
      permissionsJson: JSON.stringify(input.file.permissions ?? []),
      parentsJson: JSON.stringify(input.file.parents ?? []),
      modifiedAt: input.file.modifiedTime,
      webViewLink: validatedGoogleSourceUrl(input.file.webViewLink),
      md5Checksum: persistedChecksum,
      sizeBytes: input.file.size ? Number(input.file.size) : null,
      trashed: Boolean(input.file.trashed),
      indexStatus: (indexed ? "indexed" : "unsupported") as
        | "indexed"
        | "unsupported",
      retryCount: 0,
      extractionError: null,
      extractionMode: input.extractionMode ?? null,
      structuralFallbackReason: input.structuralFallbackReason ?? null,
      searchableStatus: (indexed ? "searchable" : "hidden") as
        | "searchable"
        | "hidden",
      extractionVersion: "structural-v1",
      indexingVersion: "literal-v1",
      tombstonedAt: null,
      lastPermissionCheckedAt: now,
      updatedAt: now,
    };
  // One file's version + units + status land through a single transactional
  // db.batch (chunked only for pathological unit counts, with the completeness
  // flip ordered last) — this is the per-file durable checkpoint.
  await runBatchChunks(
    db,
    extractedFileStatements(db as StatementDb, {
      versionId,
      fileId,
      sourceModifiedAt: input.file.modifiedTime,
      contentHash: combinedHash,
      units: input.units.map((unit, index) => ({
        id: `unit_${versionId}_${index}`,
        workspaceId: input.workspaceId,
        fileId,
        fileVersionId: versionId,
        unitType: unit.unitType,
        structuralLocationJson: JSON.stringify(unit.location),
        textContent: unit.text,
        contentHash: unit.contentHash,
        createdAt: now,
      })),
      sourceFile: {
        id: fileId,
        workspaceId: input.workspaceId,
        connectorId: input.connectorId,
        sourceId: input.file.id,
        ...statusFields,
        createdAt: now,
      },
      sourceFileUpdate: statusFields,
      now,
    }),
    input.budget,
  );
  return {
    fileId,
    indexed,
    unitIds: input.units.map((_, index) => `unit_${versionId}_${index}`),
  };
}
export async function reconcileMissingSourceFiles(
  connectorId: string,
  currentSourceIds: Set<string>,
  budget?: Pick<SubrequestBudget, "spend" | "canSpend">,
) {
  const db = await getDb(),
    now = new Date().toISOString(),
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
  // Bounded like every other loop in the hop: two statements per tombstone,
  // batched, and stopped as soon as the subrequest budget is spent.
  let reconciled = 0;
  for (const row of missing) {
    if (budget && !budget.canSpend(1)) break;
    await runBatchChunks(
      db,
      [
        db
          .update(sourceFiles)
          .set({
            trashed: true,
            indexStatus: "failed",
            extractionError: "SOURCE_NO_LONGER_AUTHORIZED",
            searchableStatus: "unauthorized",
            tombstonedAt: now,
            lastPermissionCheckedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(sourceFiles.id, row.id),
              eq(sourceFiles.connectorId, connectorId),
            ),
          ),
        db.delete(extractedUnits).where(eq(extractedUnits.fileId, row.id)),
      ],
      budget,
    );
    reconciled += 1;
  }
  return reconciled;
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
  /** Terminal for this run: keeps the row settled instead of retry-eligible. */
  terminal?: boolean;
  extractionMode?: string | null;
  /**
   * Whether to also record a user-visible `indexing_failures` row. The
   * in-progress marker written before every extraction is not a failure — it
   * is durability — so it skips the failure record (and its subrequest).
   */
  recordFailure?: boolean;
} & BudgetOption) {
  const db = await getDb(),
    now = new Date().toISOString(),
    fileId = `gdrive_${await shortHash(`${input.connectorId}:${input.file.id}`)}`,
    indexStatus = input.terminal ? ("unsupported" as const) : ("failed" as const);
  input.budget?.spend(1);
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
      // No content was persisted, so no content checksum is recorded.
      md5Checksum: null,
      sizeBytes: input.file.size ? Number(input.file.size) : null,
      trashed: Boolean(input.file.trashed),
      indexStatus,
      extractionError: input.errorCode,
      extractionMode: input.extractionMode ?? null,
      searchableStatus: "hidden",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sourceFiles.connectorId, sourceFiles.sourceId],
      set: {
        indexStatus,
        extractionError: input.errorCode,
        ...(input.extractionMode
          ? { extractionMode: input.extractionMode }
          : {}),
        searchableStatus: "hidden",
        updatedAt: now,
      },
    });
  if (input.recordFailure === false) return;
  const classified = classifyIndexingFailure(input.errorCode);
  input.budget?.spend(1);
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
