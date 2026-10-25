/**
 * An in-memory SQLite database with every committed D1 migration applied,
 * wrapped in drizzle's sqlite-proxy driver. D1 is SQLite, so the repository's
 * real drizzle statements (and the FTS5 index and its triggers) run here
 * unchanged. Uses node:sqlite (Node 22.13+), so no extra dependency.
 */
import { DatabaseSync } from "node:sqlite";
import { readdir, readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../../db/schema.ts";

const MIGRATIONS = new URL("../../drizzle/", import.meta.url);

export async function migrationStatements() {
  const files = (await readdir(MIGRATIONS)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const statements = [];
  for (const name of files) {
    const text = await readFile(new URL(name, MIGRATIONS), "utf8");
    for (const statement of text.split("--> statement-breakpoint")) if (statement.trim()) statements.push({ name, sql: statement.trim() });
  }
  return statements;
}

export async function createMigratedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const statement of await migrationStatements()) sqlite.exec(statement.sql);
  const execute = (sqlText, params, method) => {
    const prepared = sqlite.prepare(sqlText);
    if (method === "run") {
      prepared.run(...params);
      return { rows: [] };
    }
    prepared.setReturnArrays(true);
    const rows = prepared.all(...params);
    return { rows: method === "get" ? rows[0] : rows };
  };
  const db = drizzle(
    async (sqlText, params, method) => execute(sqlText, params, method),
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        const results = queries.map((query) => execute(query.sql, query.params, query.method));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { schema },
  );
  return { sqlite, db };
}
