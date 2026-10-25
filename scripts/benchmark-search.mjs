/**
 * Times one search over a synthetic workspace two ways, on in-process SQLite
 * with the real migrations applied (node:sqlite, Node 22.13+):
 *
 *   full-corpus: the pre-FTS path. Load every unit of every searchable file,
 *                then match in memory.
 *   indexed:     the current path. File rows without content, FTS5 candidate
 *                lookup, then only the units that contain a query term.
 *
 * Both feed the same matcher and must return identical results. This measures
 * database work plus matching in one process; it does not include D1 network
 * latency or the Drive permission listing, which are the same for both paths.
 *
 *   node scripts/benchmark-search.mjs [files] [unitsPerFile]
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { queryTerms } from "../lib/workspace-search/matching.ts";
import { loadSearchCandidates, workspaceInventory } from "../lib/workspace-search/search-index.ts";
import { createMigratedDatabase } from "../tests/fixtures/sqlite-d1.mjs";

const FILES = Number(process.argv[2] ?? 2000),
  UNITS = Number(process.argv[3] ?? 20),
  RUNS = 7,
  WORKSPACE = "ws_bench";
const NOW = "2026-07-01T00:00:00.000Z";

let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const vocabulary = Array.from({ length: 5000 }, (_, index) => `word${index.toString(36)}`);
const sentence = (length) => Array.from({ length }, () => vocabulary[Math.floor(random() ** 2 * vocabulary.length)]).join(" ");

const { sqlite, db } = await createMigratedDatabase();
sqlite.exec("BEGIN");
const insertFile = sqlite.prepare(
  "insert into source_files (id, workspace_id, connector_id, source_id, name, mime_type, owners_json, permissions_json, parents_json, modified_at, trashed, index_status, searchable_status, created_at, updated_at) values (?, ?, 'conn', ?, ?, 'application/vnd.google-apps.document', '[]', '[]', '[]', ?, 0, 'indexed', 'searchable', ?, ?)",
);
const insertUnit = sqlite.prepare(
  "insert into extracted_units (id, workspace_id, file_id, file_version_id, unit_type, structural_location_json, text_content, content_hash, created_at) values (?, ?, ?, 'v1', 'doc_paragraph', ?, ?, ?, ?)",
);
for (let file = 0; file < FILES; file += 1) {
  const id = `file_${file}`;
  insertFile.run(id, WORKSPACE, `src_${file}`, `Report ${file} ${sentence(3)}`, NOW, NOW, NOW);
  for (let unit = 0; unit < UNITS; unit += 1) {
    // A rare phrase in ~1% of files, so one query is selective.
    const text = file % 100 === 7 && unit === 3 ? `${sentence(10)} renewal deadline ${sentence(10)}` : sentence(30);
    insertUnit.run(`${id}_u${unit}`, WORKSPACE, id, JSON.stringify({ paragraphIndex: unit }), text, `h_${file}_${unit}`, NOW);
  }
}
sqlite.exec("COMMIT");

async function fullCorpus(query) {
  const files = (await workspaceInventory(db, WORKSPACE)).filter((row) => row.searchableStatus === "searchable");
  const units = await db.select().from(schema.extractedUnits).where(eq(schema.extractedUnits.workspaceId, WORKSPACE));
  const byFile = new Map();
  for (const unit of units) {
    const list = byFile.get(unit.fileId) ?? [];
    list.push({ id: unit.id, unitType: unit.unitType, text: unit.textContent, structuralLocation: JSON.parse(unit.structuralLocationJson), contentHash: unit.contentHash });
    byFile.set(unit.fileId, list);
  }
  const response = searchWorkspaceFiles({ workspaceId: WORKSPACE, files: files.map((file) => ({ ...file, units: byFile.get(file.id) ?? [] })), query, mode: "best", fileType: "all" });
  return { response, unitsLoaded: units.length };
}

async function indexed(query) {
  const files = (await workspaceInventory(db, WORKSPACE)).filter((row) => row.searchableStatus === "searchable");
  const loaded = await loadSearchCandidates(db, { workspaceId: WORKSPACE, files, terms: queryTerms(query) });
  return { response: searchWorkspaceFiles({ workspaceId: WORKSPACE, files: loaded.files, query, mode: "best", fileType: "all" }), unitsLoaded: loaded.unitsLoaded };
}

async function median(run) {
  const times = [];
  let last;
  for (let index = 0; index < RUNS; index += 1) {
    const started = performance.now();
    last = await run();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return { ms: times[Math.floor(times.length / 2)], ...last };
}

const signature = (response) => JSON.stringify(response.results.map((result) => [result.id, result.score, result.citations.map((citation) => citation.unitId)]));
console.log(`${FILES} files x ${UNITS} units = ${FILES * UNITS} units, median of ${RUNS} runs, Node ${process.version}`);
console.log("query                      | full-corpus ms (units) | indexed ms (units) | matches");
for (const [label, query] of [["rare phrase", "renewal deadline"], ["common word", vocabulary[1]], ["uncommon word", vocabulary[4000]], ["no match", "absent"]]) {
  const before = await median(() => fullCorpus(query)), after = await median(() => indexed(query));
  if (signature(before.response) !== signature(after.response)) throw new Error(`results differ for ${query}`);
  console.log(
    `${`${label} (${query})`.padEnd(26)} | ${before.ms.toFixed(1).padStart(8)} (${before.unitsLoaded}) | ${after.ms.toFixed(1).padStart(8)} (${after.unitsLoaded}) | ${after.response.totalMatches}`,
  );
}
