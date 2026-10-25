/**
 * Pure builders for every multi-row D1 statement the indexer emits.
 *
 * They live outside `repository.ts` (which can only run with a Cloudflare D1
 * binding) so tests can construct the REAL drizzle statements against a
 * driverless database and assert their true bound-parameter and batch sizes.
 * That is the gap that let a 12-row × 9-column insert (108 bound parameters,
 * rejected by production D1) ship: every prior test simulated the pipeline in
 * memory and never built a statement.
 *
 * Every chunk size here is derived from `db/schema.ts` through
 * `lib/indexing/d1-limits.ts` — never hardcoded row counts.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { extractedUnits, fileVersions, sourceFiles } from "../../db/schema.ts";
import {
  chunkRows,
  D1_MAX_STATEMENTS_PER_BATCH,
  rowsPerStatement,
  rowsPerStatementForTable,
} from "../indexing/d1-limits.ts";

/** The statement-building surface of a drizzle SQLite database. */
export type StatementDb = Pick<
  BaseSQLiteDatabase<"async", unknown>,
  "insert" | "update" | "delete"
>;
export type SqliteStatement = BatchItem<"sqlite">;

export type SourceFileRow = typeof sourceFiles.$inferInsert;
export type ExtractedUnitRow = typeof extractedUnits.$inferInsert;

/**
 * Metadata-only discovery upsert (stage 1). Existing rows keep modified_at,
 * md5_checksum, index_status, retry_count, searchable_status, and extraction
 * fields so change detection and per-file failure state stay honest.
 */
export function discoveredMetadataStatements(
  db: StatementDb,
  rows: readonly SourceFileRow[],
): SqliteStatement[] {
  return chunkRows(rows, rowsPerStatementForTable(sourceFiles)).map((chunk) =>
    db
      .insert(sourceFiles)
      .values(chunk)
      .onConflictDoUpdate({
        target: [sourceFiles.connectorId, sourceFiles.sourceId],
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

/** Stage-2 duplicate refresh: one bounded UPDATE per file. */
export function metadataRefreshStatements(
  db: StatementDb,
  input: {
    connectorId: string;
    updates: readonly { sourceId: string; values: Partial<SourceFileRow> }[];
  },
): SqliteStatement[] {
  return input.updates.map((update) =>
    db
      .update(sourceFiles)
      .set(update.values)
      .where(
        and(
          eq(sourceFiles.connectorId, input.connectorId),
          eq(sourceFiles.sourceId, update.sourceId),
        ),
      ),
  );
}

/**
 * Per-file retry budget increments. Reserves the two non-id parameters
 * (`updated_at`, `connector_id`) before sizing the `IN (...)` list.
 */
export const RETRY_IDS_PER_STATEMENT = rowsPerStatement(1, 2);

export function retryAttemptStatements(
  db: StatementDb,
  input: { connectorId: string; sourceIds: readonly string[]; now: string },
): SqliteStatement[] {
  return chunkRows(input.sourceIds, RETRY_IDS_PER_STATEMENT).map((ids) =>
    db
      .update(sourceFiles)
      .set({
        retryCount: sql`${sourceFiles.retryCount} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(sourceFiles.connectorId, input.connectorId),
          inArray(sourceFiles.sourceId, ids),
        ),
      ),
  );
}

/**
 * One file's durable checkpoint: version row + units + status row.
 *
 * When the units span more statements than a single `db.batch()` can hold, the
 * version row is written `partial` first and only flipped to `complete` in the
 * final chunk, alongside the `source_files` status row — so an interrupted
 * multi-batch write never claims a complete extraction it did not finish.
 */
export function extractedFileStatements(
  db: StatementDb,
  input: {
    versionId: string;
    fileId: string;
    sourceModifiedAt: string;
    contentHash: string;
    units: readonly ExtractedUnitRow[];
    sourceFile: SourceFileRow;
    sourceFileUpdate: Partial<SourceFileRow>;
    now: string;
  },
): SqliteStatement[] {
  const unitChunks = chunkRows(
      input.units,
      rowsPerStatementForTable(extractedUnits),
    ),
    // version insert + units delete + unit inserts + status upsert
    totalStatements = input.units.length ? unitChunks.length + 3 : 1,
    multiBatch = totalStatements > D1_MAX_STATEMENTS_PER_BATCH,
    statements: SqliteStatement[] = [];
  if (input.units.length) {
    const versionRow = {
      id: input.versionId,
      fileId: input.fileId,
      sourceModifiedAt: input.sourceModifiedAt,
      contentHash: input.contentHash,
      extractionStatus: multiBatch ? ("partial" as const) : ("complete" as const),
      createdAt: input.now,
    };
    statements.push(
      multiBatch
        ? // Multi-batch write: force `partial` even on a re-run, so an
          // interrupted write never leaves a row claiming a complete
          // extraction whose units were only half written.
          db
            .insert(fileVersions)
            .values(versionRow)
            .onConflictDoUpdate({
              target: fileVersions.id,
              set: { extractionStatus: "partial" },
            })
        : db.insert(fileVersions).values(versionRow).onConflictDoNothing(),
      db.delete(extractedUnits).where(eq(extractedUnits.fileId, input.fileId)),
      ...unitChunks.map((chunk) => db.insert(extractedUnits).values(chunk)),
    );
    if (multiBatch)
      statements.push(
        db
          .update(fileVersions)
          .set({ extractionStatus: "complete" })
          .where(eq(fileVersions.id, input.versionId)),
      );
  }
  statements.push(
    db
      .insert(sourceFiles)
      .values(input.sourceFile)
      .onConflictDoUpdate({
        target: [sourceFiles.connectorId, sourceFiles.sourceId],
        set: input.sourceFileUpdate,
      }),
  );
  return statements;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts the D1 driver and the sqlite-proxy test driver alike.
export type DeletionDb = Pick<BaseSQLiteDatabase<"async", any>, "delete" | "run">;

/**
 * Every statement that deletes what one connector produced, in dependency
 * order, for ONE `db.batch` call. D1 runs a batch as a single transaction, so
 * a disconnect either removes all of it or none of it: a failure part-way can
 * no longer leave, say, search receipts whose source files are already gone.
 *
 * Each statement is workspace- or connector-scoped and set-based, so the count
 * is fixed (17) no matter how many files were indexed. The FTS index follows
 * the extracted_units delete through its trigger.
 *
 * Deliberately kept, because they are not connector output: the workspace and
 * its membership, developer API keys, submitted feedback, and aggregate
 * analytics counters.
 */
export function connectorDeletionStatements(db: DeletionDb, connectorId: string, workspaceId: string): SqliteStatement[] {
  return [
    // Content and content-derived records.
    db.run(sql`delete from unit_embeddings where workspace_id = ${workspaceId}`),
    db.delete(extractedUnits).where(eq(extractedUnits.workspaceId, workspaceId)),
    db.run(sql`delete from file_versions where file_id in (select id from source_files where connector_id = ${connectorId})`),
    db.run(sql`delete from file_relationships where workspace_id = ${workspaceId}`),
    db.run(sql`delete from retrieval_conflicts where workspace_id = ${workspaceId}`),
    // Retrieval records store query text, citations, and result snapshots.
    db.run(sql`delete from search_receipts where workspace_id = ${workspaceId}`),
    db.run(sql`delete from retrieval_traces where workspace_id = ${workspaceId}`),
    // Indexing history, including sanitized file names on failure rows.
    db.run(sql`delete from indexing_continuations where job_id in (select id from indexing_jobs where connector_id = ${connectorId})`),
    db.run(sql`delete from indexing_job_attempts where job_id in (select id from indexing_jobs where connector_id = ${connectorId})`),
    db.run(sql`delete from indexing_failures where connector_id = ${connectorId}`),
    db.run(sql`delete from coverage_receipts where connector_id = ${connectorId}`),
    db.run(sql`delete from indexing_jobs where connector_id = ${connectorId}`),
    // File inventory, run history, pending authorization state, and last the
    // encrypted credentials themselves.
    db.run(sql`delete from source_files where connector_id = ${connectorId}`),
    db.run(sql`delete from sync_runs where connector_id = ${connectorId}`),
    db.run(sql`delete from oauth_states where workspace_id = ${workspaceId}`),
    db.run(sql`delete from oauth_refresh_leases where connector_id = ${connectorId}`),
    db.run(sql`delete from connectors where id = ${connectorId}`),
  ];
}
