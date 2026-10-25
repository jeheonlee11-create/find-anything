/**
 * The D1 side of workspace search.
 *
 * Search used to load every extracted unit's text for the workspace and scan
 * it in the Worker on every query, so cost grew with the whole corpus. Now:
 *
 * 1. `workspaceInventory` reads the workspace's file rows WITHOUT content
 *    (names, statuses, Drive IDs). That is what the permission re-check and
 *    coverage need.
 * 2. `loadSearchCandidates` asks the `extracted_units_fts` FTS5 index (see
 *    drizzle/0021_extracted_units_fts.sql) which files contain each query
 *    term, keeps only files where every term is in the content or the
 *    name/MIME type, and loads text only for units of those files that
 *    contain a term (plus the first unit of title-only matches, for a
 *    citation). Cost now follows the number of matching units, not the
 *    corpus.
 * 3. The in-memory matcher in `core.ts` then applies the exact whole-word
 *    rules to that text. The index is only a candidate generator: its
 *    tokenizer (unicode61, case- and accent-folding) accepts a superset of what
 *    the whole-word rule accepts, so it can add candidates but never decide a
 *    result, and text always comes from `extracted_units`, never from the
 *    index's own copy.
 *
 * The FTS table is kept in sync by triggers on `extracted_units`, so every
 * writer stays correct without knowing the index exists.
 *
 * Every function takes the database as a parameter so tests can run the real
 * statements against an in-memory SQLite database (tests/search-index.test.mjs).
 */
import { and, eq, sql } from "drizzle-orm";
import { sqliteTable, text, unionAll, type BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { extractedUnits, sourceFiles } from "../../db/schema.ts";
import type { WorkspaceSearchFile } from "./core.ts";
import { containsWord, ftsPhrase, normalizeText } from "./matching.ts";

/** Declared here, not in db/schema.ts: drizzle-kit must not try to manage a virtual table. */
export const extractedUnitsFts = sqliteTable("extracted_units_fts", {
  textContent: text("text_content").notNull(),
  unitId: text("unit_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  fileId: text("file_id").notNull(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts the D1 driver and the sqlite-proxy test driver alike.
export type SearchDb = Pick<BaseSQLiteDatabase<"async", any>, "select" | "selectDistinct">;

/** File IDs per json_each() parameter: one bound parameter, far under D1's 2 MB value limit. */
const IDS_PER_QUERY = 2_000;

export interface InventoryRow {
  id: string;
  workspaceId: string;
  connectorId: string;
  sourceId: string;
  name: string;
  mimeType: string;
  modifiedAt: string;
  webViewLink: string | null;
  indexStatus: string;
  searchableStatus: string;
  extractionError: string | null;
  extractionMode: string | null;
  structuralFallbackReason: string | null;
}

/** Every non-trashed file row in the workspace, without any extracted content. */
export async function workspaceInventory(db: SearchDb, workspaceId: string): Promise<InventoryRow[]> {
  return db
    .select({
      id: sourceFiles.id,
      workspaceId: sourceFiles.workspaceId,
      connectorId: sourceFiles.connectorId,
      sourceId: sourceFiles.sourceId,
      name: sourceFiles.name,
      mimeType: sourceFiles.mimeType,
      modifiedAt: sourceFiles.modifiedAt,
      webViewLink: sourceFiles.webViewLink,
      indexStatus: sourceFiles.indexStatus,
      searchableStatus: sourceFiles.searchableStatus,
      extractionError: sourceFiles.extractionError,
      extractionMode: sourceFiles.extractionMode,
      structuralFallbackReason: sourceFiles.structuralFallbackReason,
    })
    .from(sourceFiles)
    .where(and(eq(sourceFiles.workspaceId, workspaceId), eq(sourceFiles.trashed, false)));
}

/**
 * Fail-closed permission split. A stored row is allowed only if the Drive file
 * it came from is in the inventory Google just returned for the connected
 * account. `undefined` means the workspace has no Drive behind it (the
 * synthetic demo fixture), where every stored row is the authorized set.
 */
export function partitionByPermission<T extends { sourceId: string }>(rows: T[], authorizedSourceIds: Set<string> | undefined) {
  const allowed: T[] = [], denied: T[] = [];
  for (const row of rows) (!authorizedSourceIds || authorizedSourceIds.has(row.sourceId) ? allowed : denied).push(row);
  return { allowed, denied };
}

type Unit = WorkspaceSearchFile["units"][number];

function idChunks(ids: string[]) {
  const chunks: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += IDS_PER_QUERY) chunks.push(ids.slice(offset, offset + IDS_PER_QUERY));
  return chunks;
}

function toUnit(row: { id: string; unitType: string; text: string; structuralLocationJson: string; contentHash: string }): Unit {
  return {
    id: row.id,
    unitType: row.unitType,
    text: row.text,
    structuralLocation: JSON.parse(row.structuralLocationJson) as Record<string, unknown>,
    contentHash: row.contentHash,
  };
}

const unitColumns = {
  id: extractedUnits.id,
  fileId: extractedUnits.fileId,
  unitType: extractedUnits.unitType,
  text: extractedUnits.textContent,
  structuralLocationJson: extractedUnits.structuralLocationJson,
  contentHash: extractedUnits.contentHash,
};

/** For each term (by position), the IDs of files with at least one unit containing it, per the index. */
export async function filesContainingTerms(db: SearchDb, workspaceId: string, terms: string[]): Promise<Array<Set<string>>> {
  const sets = terms.map(() => new Set<string>());
  if (!terms.length) return sets;
  const perTerm = terms.map((term, index) =>
    db
      .selectDistinct({ termIndex: sql<number>`${sql.raw(String(index))}`.as("term_index"), fileId: extractedUnitsFts.fileId })
      .from(extractedUnitsFts)
      .where(and(sql`${extractedUnitsFts} match ${ftsPhrase(term)}`, eq(extractedUnitsFts.workspaceId, workspaceId))),
  );
  // One statement, one D1 round trip, 2 bound parameters per term.
  const rows = perTerm.length === 1 ? await perTerm[0] : await unionAll(perTerm[0], perTerm[1], ...perTerm.slice(2));
  for (const row of rows) sets[Number(row.termIndex)]?.add(row.fileId);
  return sets;
}

export interface CandidateLoad {
  /** The input files, each with only the units search needs (empty for non-candidates). */
  files: WorkspaceSearchFile[];
  candidateFiles: number;
  unitsLoaded: number;
}

/**
 * Attaches units to the searchable files that can possibly match.
 *
 * - With terms: a file is a candidate when every term is in its name/MIME type
 *   (whole word) or, per the index, in some unit. Only units containing a term
 *   are loaded, plus the first unit of candidates with none (title-only
 *   matches still get a citation).
 * - Without terms (browse all indexed files): the first five units of each
 *   file, the same citations the matcher shows for a browse.
 *
 * Name-only (`metadata`) rows never get units: their content was not read.
 */
export async function loadSearchCandidates(
  db: SearchDb,
  input: { workspaceId: string; files: InventoryRow[]; terms: string[] },
): Promise<CandidateLoad> {
  const { workspaceId, terms } = input,
    indexed = input.files.filter((file) => file.indexStatus === "indexed");
  let candidateIds: string[];
  if (!terms.length) candidateIds = indexed.map((file) => file.id);
  else {
    const termFiles = await filesContainingTerms(db, workspaceId, terms);
    candidateIds = indexed
      .filter((file) => {
        const name = normalizeText(file.name),
          mime = normalizeText(file.mimeType);
        return terms.every((term, index) => termFiles[index].has(file.id) || containsWord(name, term) || containsWord(mime, term));
      })
      .map((file) => file.id);
  }
  const unitsByFile = new Map<string, Unit[]>();
  const add = (row: Parameters<typeof toUnit>[0] & { fileId: string }) => {
    const units = unitsByFile.get(row.fileId) ?? [];
    units.push(toUnit(row));
    unitsByFile.set(row.fileId, units);
  };
  if (terms.length)
    for (const chunk of idChunks(candidateIds)) {
      const rows = await db
        .select(unitColumns)
        .from(extractedUnitsFts)
        .innerJoin(extractedUnits, eq(extractedUnits.id, extractedUnitsFts.unitId))
        .where(
          and(
            sql`${extractedUnitsFts} match ${terms.map(ftsPhrase).join(" OR ")}`,
            eq(extractedUnitsFts.workspaceId, workspaceId),
            eq(extractedUnits.workspaceId, workspaceId),
            sql`${extractedUnitsFts.fileId} in (select value from json_each(${JSON.stringify(chunk)}))`,
          ),
        )
        .orderBy(sql`${extractedUnits}.rowid`);
      rows.forEach(add);
    }
  // Leading units: the citations of a browse (no terms, up to 5 like a
  // match) or of a title-only match (1, the matcher's fallback citation).
  const withoutUnits = candidateIds.filter((id) => !unitsByFile.has(id)),
    perFile = terms.length ? 1 : 5;
  for (const chunk of idChunks(withoutUnits)) {
    const rows = await db
      .select(unitColumns)
      .from(extractedUnits)
      .where(
        sql`${extractedUnits}.rowid in (select rowid from (select rowid, row_number() over (partition by file_id order by rowid) as position from ${extractedUnits} where workspace_id = ${workspaceId} and file_id in (select value from json_each(${JSON.stringify(chunk)}))) where position <= ${perFile})`,
      )
      .orderBy(sql`${extractedUnits}.rowid`);
    rows.forEach(add);
  }
  let unitsLoaded = 0;
  const files = input.files.map((file) => {
    const units = file.indexStatus === "indexed" ? unitsByFile.get(file.id) ?? [] : [];
    unitsLoaded += units.length;
    return { ...file, units };
  });
  return { files, candidateFiles: candidateIds.length, unitsLoaded };
}
