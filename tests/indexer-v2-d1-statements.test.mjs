import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema.ts";
import {
  D1_MAX_BOUND_PARAMS,
  D1_MAX_STATEMENTS_PER_BATCH,
  chunkRows,
  rowsPerStatementForTable,
  tableColumnCount,
} from "../lib/indexing/d1-limits.ts";
import {
  discoveredMetadataStatements,
  extractedFileStatements,
  metadataRefreshStatements,
  retryAttemptStatements,
} from "../lib/google-drive/statement-builders.ts";
import {
  accumulatedCounter,
  continuationExecutionFence,
  monotonicCounter,
} from "../lib/indexing/continuation-fence.ts";

/**
 * These tests build the REAL drizzle statements the indexer emits and read
 * their compiled SQL. Every earlier suite simulated the pipeline in memory and
 * never executed drizzle, which is exactly how a 12-row x 9-column insert
 * (108 bound parameters, hard-rejected by production D1) shipped: the
 * simulation had no notion of a bound parameter.
 *
 * No network, no D1 binding: `sqlite-proxy` compiles statements without ever
 * running them.
 */
const db = drizzle(async () => ({ rows: [] }), { schema });
const NOW = "2026-07-29T00:00:00.000Z";

function metadataRow(index) {
  return {
    id: `gdrive_${index}`,
    workspaceId: "ws_1",
    connectorId: "conn_1",
    sourceId: `src_${index}`,
    name: `File ${index}`,
    mimeType: "application/pdf",
    ownersJson: "[]",
    permissionsJson: "[]",
    parentsJson: "[]",
    modifiedAt: NOW,
    webViewLink: null,
    md5Checksum: null,
    sizeBytes: 1024,
    trashed: false,
    indexStatus: "metadata",
    searchableStatus: "searchable",
    lastPermissionCheckedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function unitRow(index) {
  return {
    id: `unit_ver_1_${index}`,
    workspaceId: "ws_1",
    fileId: "gdrive_1",
    fileVersionId: "ver_1",
    unitType: "paragraph",
    structuralLocationJson: JSON.stringify({ page: index }),
    textContent: `passage ${index}`,
    contentHash: `hash_${index}`,
    createdAt: NOW,
  };
}

function statusFields() {
  return {
    name: "File 1",
    mimeType: "application/pdf",
    ownersJson: "[]",
    permissionsJson: "[]",
    parentsJson: "[]",
    modifiedAt: NOW,
    webViewLink: null,
    md5Checksum: "md5-1",
    sizeBytes: 2048,
    trashed: false,
    indexStatus: "indexed",
    retryCount: 0,
    extractionError: null,
    extractionMode: "native",
    structuralFallbackReason: null,
    searchableStatus: "searchable",
    extractionVersion: "structural-v1",
    indexingVersion: "literal-v1",
    tombstonedAt: null,
    lastPermissionCheckedAt: NOW,
    updatedAt: NOW,
  };
}

function extractedStatements(unitCount) {
  return extractedFileStatements(db, {
    versionId: "ver_1",
    fileId: "gdrive_1",
    sourceModifiedAt: NOW,
    contentHash: "combined-hash",
    units: Array.from({ length: unitCount }, (_, index) => unitRow(index)),
    sourceFile: {
      id: "gdrive_1",
      workspaceId: "ws_1",
      connectorId: "conn_1",
      sourceId: "src_1",
      ...statusFields(),
      createdAt: NOW,
    },
    sourceFileUpdate: statusFields(),
    now: NOW,
  });
}

function everyStatement() {
  return [
    ...discoveredMetadataStatements(
      db,
      Array.from({ length: 1_000 }, (_, index) => metadataRow(index)),
    ),
    ...metadataRefreshStatements(db, {
      connectorId: "conn_1",
      updates: Array.from({ length: 200 }, (_, index) => ({
        sourceId: `src_${index}`,
        values: {
          name: `File ${index}`,
          mimeType: "application/pdf",
          ownersJson: "[]",
          permissionsJson: "[]",
          parentsJson: "[]",
          modifiedAt: NOW,
          webViewLink: null,
          sizeBytes: 10,
          trashed: false,
          lastPermissionCheckedAt: NOW,
          updatedAt: NOW,
        },
      })),
    }),
    ...retryAttemptStatements(db, {
      connectorId: "conn_1",
      sourceIds: Array.from({ length: 500 }, (_, index) => `src_${index}`),
      now: NOW,
    }),
    ...extractedStatements(5_000),
    ...extractedStatements(1),
    ...extractedStatements(0),
  ];
}

test("no generated statement exceeds D1's bound-parameter limit", () => {
  const statements = everyStatement();
  assert.ok(statements.length > 500, "expected a large statement population");
  const worst = statements
    .map((statement) => statement.toSQL().params.length)
    .reduce((highest, value) => Math.max(highest, value), 0);
  assert.ok(
    worst <= D1_MAX_BOUND_PARAMS,
    `a generated statement bound ${worst} parameters (cap ${D1_MAX_BOUND_PARAMS})`,
  );
  assert.ok(worst > 0);
});

test("no db.batch chunk exceeds 40 statements", () => {
  for (const statements of [
    discoveredMetadataStatements(
      db,
      Array.from({ length: 5_000 }, (_, index) => metadataRow(index)),
    ),
    extractedStatements(5_000),
    retryAttemptStatements(db, {
      connectorId: "conn_1",
      sourceIds: Array.from({ length: 5_000 }, (_, index) => `src_${index}`),
      now: NOW,
    }),
  ])
    for (const chunk of chunkRows(statements, D1_MAX_STATEMENTS_PER_BATCH))
      assert.ok(
        chunk.length <= D1_MAX_STATEMENTS_PER_BATCH,
        `batch of ${chunk.length} statements exceeds ${D1_MAX_STATEMENTS_PER_BATCH}`,
      );
  assert.equal(D1_MAX_STATEMENTS_PER_BATCH, 40);
});

test("multi-row statements are sized by column count derived from db/schema.ts", () => {
  const unitColumns = tableColumnCount(schema.extractedUnits);
  assert.equal(unitColumns, Object.keys(getTableColumns(schema.extractedUnits)).length);
  // The regression itself, compiled rather than assumed: the shipped builder
  // used a hardcoded 12 rows per statement, which D1 rejects outright.
  const shippedOverflow = db
    .insert(schema.extractedUnits)
    .values(Array.from({ length: 12 }, (_, index) => unitRow(index)))
    .toSQL();
  assert.equal(shippedOverflow.params.length, 12 * unitColumns);
  assert.ok(
    shippedOverflow.params.length > D1_MAX_BOUND_PARAMS,
    "fixture no longer reproduces the shipped 108-parameter overflow",
  );
  const rows = rowsPerStatementForTable(schema.extractedUnits);
  assert.ok(rows * unitColumns <= D1_MAX_BOUND_PARAMS);
  assert.ok(rows >= 1);
  // And the derivation, not a constant, is what the builder uses.
  const [, , firstUnitInsert] = extractedStatements(5_000);
  assert.equal(firstUnitInsert.toSQL().params.length, rows * unitColumns);
  // Adding a column to the table must shrink the chunk, not overflow it.
  assert.equal(rowsPerStatementForTable(schema.sourceFiles) * tableColumnCount(schema.sourceFiles) <= D1_MAX_BOUND_PARAMS, true);
});

test("a multi-batch extraction never claims completeness before its last unit lands", () => {
  const many = extractedStatements(5_000).map((statement) => statement.toSQL().sql);
  assert.ok(
    many.length > D1_MAX_STATEMENTS_PER_BATCH,
    "fixture must span more than one db.batch",
  );
  assert.match(many[0], /insert into "file_versions"/);
  assert.match(many[0], /'partial'|\?/);
  const versionInsertParams = extractedStatements(5_000)[0].toSQL().params;
  assert.ok(versionInsertParams.includes("partial"));
  assert.ok(!versionInsertParams.includes("complete"));
  // The completeness flip is the last statement before the status row.
  const flip = many[many.length - 2];
  assert.match(flip, /update "file_versions" set "extraction_status"/);
  assert.match(many[many.length - 1], /insert into "source_files"/);
  // A single-batch write stays atomic and marks complete directly.
  const few = extractedStatements(2);
  assert.ok(few.length <= D1_MAX_STATEMENTS_PER_BATCH);
  assert.ok(few[0].toSQL().params.includes("complete"));
});

test("the completion fence requires the live worker_started lease owner", () => {
  const fenced = db
    .update(schema.indexingJobs)
    .set({ status: "queued", updatedAt: NOW })
    .where(
      continuationExecutionFence({
        jobId: "job_1",
        continuationId: "continuation_job_1_3",
        leaseOwner: "exec_owner_a",
      }),
    )
    .toSQL();
  assert.match(fenced.sql, /"indexing_continuations"\."status" = \?/);
  assert.match(fenced.sql, /"indexing_continuations"\."execution_lease_owner" = \?/);
  assert.ok(fenced.params.includes("worker_started"));
  assert.ok(fenced.params.includes("exec_owner_a"));
  assert.ok(fenced.params.includes("continuation_job_1_3"));
  // Without an owner the fence still pins id, job, and worker_started status.
  const ownerless = db
    .update(schema.indexingJobs)
    .set({ status: "queued", updatedAt: NOW })
    .where(
      continuationExecutionFence({
        jobId: "job_1",
        continuationId: "continuation_job_1_3",
        leaseOwner: null,
      }),
    )
    .toSQL();
  assert.doesNotMatch(ownerless.sql, /execution_lease_owner/);
  assert.ok(ownerless.params.includes("worker_started"));
});

test("progress counters only rise and per-hop event counts accumulate", () => {
  const raise = db
    .update(schema.indexingJobs)
    .set({
      processedCount: monotonicCounter(schema.indexingJobs.processedCount, 0),
      updatedAt: NOW,
    })
    .toSQL();
  // A fresh hop reporting 0 can never lower the persisted 9,500.
  assert.match(raise.sql, /"processed_count" = max\("indexing_jobs"\."processed_count", \?\)/);
  assert.ok(raise.params.includes(0));
  const accumulate = db
    .update(schema.indexingJobs)
    .set({
      duplicateCount: accumulatedCounter(schema.indexingJobs.duplicateCount, 500),
      updatedAt: NOW,
    })
    .toSQL();
  assert.match(accumulate.sql, /"duplicate_count" = "indexing_jobs"\."duplicate_count" \+ \?/);
  assert.ok(accumulate.params.includes(500));
});

test("the retry-budget statement reserves its non-id parameters", () => {
  const [statement] = retryAttemptStatements(db, {
    connectorId: "conn_1",
    sourceIds: Array.from({ length: 5_000 }, (_, index) => `src_${index}`),
    now: NOW,
  });
  const compiled = statement.toSQL();
  assert.ok(compiled.params.length <= D1_MAX_BOUND_PARAMS);
  // updated_at + connector_id are bound alongside the id list.
  assert.ok(compiled.params.includes(NOW));
  assert.ok(compiled.params.includes("conn_1"));
  assert.match(compiled.sql, /"retry_count" \+ 1/);
});
