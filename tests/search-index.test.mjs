import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { queryTerms } from "../lib/workspace-search/matching.ts";
import {
  loadSearchCandidates,
  partitionByPermission,
  workspaceInventory,
} from "../lib/workspace-search/search-index.ts";
import { createMigratedDatabase, migrationStatements } from "./fixtures/sqlite-d1.mjs";

const NOW = "2026-07-01T00:00:00.000Z";
const DOC = "application/vnd.google-apps.document";

async function seed(db, workspaceId, files) {
  for (const file of files) {
    await db.insert(schema.sourceFiles).values({
      id: file.id,
      workspaceId,
      connectorId: `conn_${workspaceId}`,
      sourceId: file.sourceId ?? `src_${file.id}`,
      name: file.name,
      mimeType: file.mimeType ?? DOC,
      ownersJson: "[]",
      permissionsJson: "[]",
      parentsJson: "[]",
      modifiedAt: NOW,
      trashed: false,
      indexStatus: file.indexStatus ?? "indexed",
      searchableStatus: "searchable",
      createdAt: NOW,
      updatedAt: NOW,
    });
    for (const [index, text] of (file.units ?? []).entries())
      await db.insert(schema.extractedUnits).values({
        id: `${file.id}_u${index}`,
        workspaceId,
        fileId: file.id,
        fileVersionId: `${file.id}_v1`,
        unitType: "doc_paragraph",
        structuralLocationJson: JSON.stringify({ paragraphIndex: index }),
        textContent: text,
        contentHash: `${file.id}_h${index}`,
        createdAt: NOW,
      });
  }
}

async function ftsSearch(db, workspaceId, query, authorized) {
  const { allowed } = partitionByPermission(await workspaceInventory(db, workspaceId), authorized);
  const searchable = allowed.filter((row) => row.searchableStatus === "searchable");
  const loaded = await loadSearchCandidates(db, { workspaceId, files: searchable, terms: queryTerms(query) });
  return { loaded, response: searchWorkspaceFiles({ workspaceId, files: loaded.files, query, mode: "best", fileType: "all", pageSize: 100 }) };
}

/** The pre-FTS behavior: every unit of every searchable file, matched in memory. */
async function fullCorpusSearch(db, workspaceId, query) {
  const files = (await workspaceInventory(db, workspaceId)).filter((row) => row.searchableStatus === "searchable");
  const units = await db.select().from(schema.extractedUnits).where(eq(schema.extractedUnits.workspaceId, workspaceId));
  const withUnits = files.map((file) => ({
    ...file,
    units: units
      .filter((unit) => unit.fileId === file.id)
      .map((unit) => ({ id: unit.id, unitType: unit.unitType, text: unit.textContent, structuralLocation: JSON.parse(unit.structuralLocationJson), contentHash: unit.contentHash })),
  }));
  return searchWorkspaceFiles({ workspaceId, files: withUnits, query, mode: "best", fileType: "all", pageSize: 100 });
}

function comparable(response) {
  return response.results.map((result) => ({ id: result.id, score: result.score, citations: result.citations.map((citation) => citation.unitId), snippet: result.snippet }));
}

test("every migration applies to SQLite, and every trigger is a single line", async () => {
  const statements = await migrationStatements();
  for (const statement of statements.filter((item) => /CREATE TRIGGER/i.test(item.sql)))
    assert.doesNotMatch(statement.sql, /\n/, `${statement.name} trigger must be one line`);
  const { sqlite } = await createMigratedDatabase();
  const row = sqlite.prepare("select name from sqlite_master where name = 'extracted_units_fts'").get();
  assert.equal(row?.name, "extracted_units_fts");
});

test("the full-text index follows inserts, updates, and deletes of extracted units", async () => {
  const { sqlite, db } = await createMigratedDatabase();
  await seed(db, "ws_a", [{ id: "f1", name: "One", units: ["alpha beta", "gamma"] }]);
  const count = () => sqlite.prepare("select count(*) as c from extracted_units_fts").get().c;
  assert.equal(count(), 2);
  await db.update(schema.extractedUnits).set({ textContent: "delta" }).where(eq(schema.extractedUnits.id, "f1_u1"));
  assert.equal(sqlite.prepare("select count(*) as c from extracted_units_fts where extracted_units_fts match 'delta'").get().c, 1);
  assert.equal(sqlite.prepare("select count(*) as c from extracted_units_fts where extracted_units_fts match 'gamma'").get().c, 0);
  await db.delete(schema.extractedUnits).where(eq(schema.extractedUnits.fileId, "f1"));
  assert.equal(count(), 0);
});

test("candidate loading reads only units that contain a query term", async () => {
  const { db } = await createMigratedDatabase();
  await seed(db, "ws_a", [
    { id: "word", name: "Notes", units: ["intro", "the cat sat here", "outro"] },
    { id: "substring", name: "Notes", units: ["a category list"] },
    { id: "title", name: "Cat plan", units: ["nothing relevant", "still nothing"] },
    { id: "other", name: "Other", units: ["dogs only"] },
  ]);
  const { loaded, response } = await ftsSearch(db, "ws_a", "cat");
  assert.deepEqual(new Set(response.results.map((result) => result.id)), new Set(["word", "title"]));
  assert.equal(loaded.candidateFiles, 2);
  // "word": its one matching unit; "title": its first unit for the citation.
  assert.equal(loaded.unitsLoaded, 2);
  assert.equal(loaded.files.find((file) => file.id === "other").units.length, 0);
});

test("the indexed path returns exactly what the full-corpus path returned", async () => {
  const { db } = await createMigratedDatabase();
  const words = ["pricing", "launch", "draft", "final", "budget", "q3-plan", "renewal", "contract", "cat", "category", "café", "cafe"];
  const files = Array.from({ length: 60 }, (_, index) => ({
    id: `file_${String(index).padStart(2, "0")}`,
    name: index % 7 === 0 ? `Launch ${words[index % words.length]}` : `Document ${index}`,
    indexStatus: index % 11 === 5 ? "metadata" : "indexed",
    units: Array.from({ length: 1 + (index % 4) }, (_, unit) =>
      `${words[(index + unit) % words.length]} notes ${words[(index * 3 + unit) % words.length]}. Line ${unit}`,
    ),
  }));
  await seed(db, "ws_a", files);
  await seed(db, "ws_b", [{ id: "foreign", name: "Launch pricing", units: ["pricing launch final"] }]);
  for (const query of ["pricing", "launch final", "q3-plan", "cat", "café", "cafe", "Launch", "missing", "notes line", ""]) {
    const indexed = (await ftsSearch(db, "ws_a", query)).response, full = await fullCorpusSearch(db, "ws_a", query);
    assert.deepEqual(comparable(indexed), comparable(full), `query ${JSON.stringify(query)}`);
    assert.equal(indexed.totalMatches, full.totalMatches);
    assert.ok(indexed.results.every((result) => result.id !== "foreign"));
  }
});

test("stored rows missing from the current Drive inventory are denied, not searched", async () => {
  const { db } = await createMigratedDatabase();
  await seed(db, "ws_a", [
    { id: "kept", sourceId: "drive_kept", name: "Needle kept", units: ["needle"] },
    { id: "revoked", sourceId: "drive_revoked", name: "Needle revoked", units: ["needle"] },
  ]);
  const inventory = await workspaceInventory(db, "ws_a");
  const { allowed, denied } = partitionByPermission(inventory, new Set(["drive_kept"]));
  assert.deepEqual(allowed.map((row) => row.id), ["kept"]);
  assert.deepEqual(denied.map((row) => row.id), ["revoked"]);
  const { response } = await ftsSearch(db, "ws_a", "needle", new Set(["drive_kept"]));
  assert.deepEqual(response.results.map((result) => result.id), ["kept"]);
  // An empty inventory denies everything rather than falling open.
  assert.equal(partitionByPermission(inventory, new Set()).allowed.length, 0);
});

test("the per-search permission listing asks Drive for file IDs only, and still reads every page", async () => {
  const { listAllDriveFiles, PERMISSION_CHECK_FIELDS } = await import("../lib/google-drive/client.ts");
  const originalFetch = globalThis.fetch, requested = [];
  globalThis.fetch = async (url) => {
    const params = new URL(url).searchParams, page = Number(params.get("pageToken") ?? 0);
    requested.push(params.get("fields"));
    return new Response(JSON.stringify({ files: [{ id: `f${page}` }], ...(page < 2 ? { nextPageToken: String(page + 1) } : {}) }), { status: 200 });
  };
  try {
    const inventory = await listAllDriveFiles("token", undefined, { fields: PERMISSION_CHECK_FIELDS });
    assert.deepEqual(inventory.files.map((file) => file.id), ["f0", "f1", "f2"]);
    assert.equal(inventory.paginationComplete, true);
    assert.deepEqual(requested, [PERMISSION_CHECK_FIELDS, PERMISSION_CHECK_FIELDS, PERMISSION_CHECK_FIELDS]);
    assert.equal(PERMISSION_CHECK_FIELDS, "nextPageToken,incompleteSearch,files(id)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
