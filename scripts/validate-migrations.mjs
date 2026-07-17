import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const files = (await readdir(new URL("../drizzle", import.meta.url)))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
assert.ok(files.length > 0, "No D1 migrations found");
for (const [index, file] of files.entries()) {
  assert.equal(Number(file.slice(0, 4)), index, `Migration sequence gap at ${file}`);
  const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
  assert.ok(sql.trim().length > 0, `${file} is empty`);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM source_files/i, `${file} contains destructive SQL`);
}
console.log(`Validated ${files.length} forward-only D1 migrations.`);
