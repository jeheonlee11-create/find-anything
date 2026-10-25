import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { connectorDeletionStatements } from "../lib/google-drive/statement-builders.ts";
import { createMigratedDatabase } from "./fixtures/sqlite-d1.mjs";

const NOW = "2026-07-01T00:00:00.000Z";

function seedWorkspace(sqlite, workspace) {
  const connector = `conn_${workspace}`, file = `file_${workspace}`, job = `job_${workspace}`;
  const run = (text, ...params) => sqlite.prepare(text).run(...params);
  run("insert into workspaces (id, name, owner_user_id, created_at, updated_at) values (?, 'W', 'actor', ?, ?)", workspace, NOW, NOW);
  run("insert into memberships (id, workspace_id, user_id, role, created_at) values (?, ?, 'actor', 'owner', ?)", `m_${workspace}`, workspace, NOW);
  run("insert into api_keys (id, workspace_id, actor_id, name, key_prefix, key_hash, created_at) values (?, ?, 'actor', 'k', 'fa_live_', ?, ?)", `key_${workspace}`, workspace, `hash_${workspace}`, NOW);
  run("insert into connectors (id, workspace_id, actor_id, provider, status, access_token_ciphertext, granted_scopes, created_at, updated_at) values (?, ?, 'actor', 'google_drive', 'connected', 'v2.x', 'scope', ?, ?)", connector, workspace, NOW, NOW);
  run("insert into source_files (id, workspace_id, connector_id, source_id, name, mime_type, owners_json, permissions_json, parents_json, modified_at, trashed, index_status, searchable_status, created_at, updated_at) values (?, ?, ?, 'src', 'Doc', 'text/plain', '[]', '[]', '[]', ?, 0, 'indexed', 'searchable', ?, ?)", file, workspace, connector, NOW, NOW, NOW);
  run("insert into file_versions (id, file_id, source_modified_at, content_hash, extraction_status, created_at) values (?, ?, ?, 'h', 'complete', ?)", `v_${workspace}`, file, NOW, NOW);
  run("insert into extracted_units (id, workspace_id, file_id, file_version_id, unit_type, structural_location_json, text_content, content_hash, created_at) values (?, ?, ?, ?, 'text', '{}', 'secret words', 'h', ?)", `u_${workspace}`, workspace, file, `v_${workspace}`, NOW);
  run("insert into sync_runs (id, connector_id, status, files_discovered, files_indexed, files_failed, started_at) values (?, ?, 'complete', 1, 1, 0, ?)", `sync_${workspace}`, connector, NOW);
  run("insert into oauth_states (state_hash, actor_id, workspace_id, pkce_verifier_ciphertext, expires_at, created_at) values (?, 'actor', ?, 'v2.x', ?, ?)", `state_${workspace}`, workspace, NOW, NOW);
  return { connector, job };
}

const count = (sqlite, table, where = "1 = 1") => sqlite.prepare(`select count(*) as c from ${table} where ${where}`).get().c;

test("disconnect deletes one connector's data in one batch and keeps the account", async () => {
  const { sqlite, db } = await createMigratedDatabase();
  const a = seedWorkspace(sqlite, "ws_a");
  seedWorkspace(sqlite, "ws_b");
  const statements = connectorDeletionStatements(db, a.connector, "ws_a");
  assert.equal(statements.length, 17);
  await db.batch(statements);
  for (const table of ["connectors", "source_files", "extracted_units", "oauth_states"]) assert.equal(count(sqlite, table, "workspace_id = 'ws_a'"), 0, table);
  assert.equal(count(sqlite, "sync_runs", "connector_id = 'conn_ws_a'"), 0);
  assert.equal(count(sqlite, "file_versions", "file_id = 'file_ws_a'"), 0);
  assert.equal(count(sqlite, "extracted_units_fts", "workspace_id = 'ws_a'"), 0, "the FTS index follows through its trigger");
  // The other workspace is untouched, and the account itself is kept.
  assert.equal(count(sqlite, "extracted_units", "workspace_id = 'ws_b'"), 1);
  assert.equal(count(sqlite, "extracted_units_fts", "workspace_id = 'ws_b'"), 1);
  assert.equal(count(sqlite, "workspaces", "id = 'ws_a'"), 1);
  assert.equal(count(sqlite, "memberships", "workspace_id = 'ws_a'"), 1);
  assert.equal(count(sqlite, "api_keys", "workspace_id = 'ws_a'"), 1);
});

test("a failure part-way through the batch deletes nothing", async () => {
  const { sqlite, db } = await createMigratedDatabase();
  const a = seedWorkspace(sqlite, "ws_a");
  const statements = connectorDeletionStatements(db, a.connector, "ws_a");
  // Fail after the content deletes but before the credentials are removed.
  statements.splice(8, 0, db.run(sql`delete from table_that_does_not_exist`));
  await assert.rejects(db.batch(statements));
  assert.equal(count(sqlite, "extracted_units", "workspace_id = 'ws_a'"), 1);
  assert.equal(count(sqlite, "connectors", "workspace_id = 'ws_a'"), 1);
  assert.equal(count(sqlite, "source_files", "workspace_id = 'ws_a'"), 1);
});
