/**
 * Hard Cloudflare D1 statement limits, in one place.
 *
 * D1 rejects a prepared statement with more than 100 bound parameters, and a
 * `db.batch()` degrades badly past a few dozen statements. Multi-row inserts
 * must therefore be sized by PARAMETER count, never by row count: a table with
 * 9 columns fits 11 rows per statement, a table with 28 columns fits 3. Sizing
 * by rows is how a 12-row × 9-column insert (108 params) shipped.
 *
 * Every multi-row statement builder derives its chunk size from
 * `rowsPerStatementForTable`, so adding a column to db/schema.ts automatically
 * shrinks the chunk instead of silently overflowing in production.
 */
import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/** D1's limit is 100; we cap at 99 so an off-by-one can never reach it. */
export const D1_MAX_BOUND_PARAMS = 99;
/** Statements per `db.batch()`. */
export const D1_MAX_STATEMENTS_PER_BATCH = 40;

export function tableColumnCount(table: SQLiteTable) {
  return Object.keys(getTableColumns(table)).length;
}

/**
 * Bound parameters still available for row values once the fixed parameters of
 * a statement (WHERE keys, SET values, conflict targets) are accounted for.
 */
export function boundValuesPerStatement(reservedParams = 0) {
  return Math.max(1, D1_MAX_BOUND_PARAMS - Math.max(0, reservedParams));
}

/** Rows that fit in one statement given the per-row bound-parameter cost. */
export function rowsPerStatement(paramsPerRow: number, reservedParams = 0) {
  return Math.max(
    1,
    Math.floor(boundValuesPerStatement(reservedParams) / Math.max(1, paramsPerRow)),
  );
}

/**
 * Rows per statement for a whole-table insert. Uses the table's full column
 * count, which is an upper bound on the parameters drizzle binds per row
 * (drizzle binds the union of supplied keys plus defaulted columns).
 */
export function rowsPerStatementForTable(
  table: SQLiteTable,
  reservedParams = 0,
) {
  return rowsPerStatement(tableColumnCount(table), reservedParams);
}

/** Split rows into statement-sized chunks. */
export function chunkRows<T>(rows: readonly T[], rowsPerChunk: number): T[][] {
  const size = Math.max(1, rowsPerChunk),
    chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size)
    chunks.push(rows.slice(offset, offset + size) as T[]);
  return chunks;
}

/** Split rows so each chunk fits inside one statement for `table`. */
export function chunkRowsForTable<T>(
  rows: readonly T[],
  table: SQLiteTable,
  reservedParams = 0,
): T[][] {
  return chunkRows(rows, rowsPerStatementForTable(table, reservedParams));
}
