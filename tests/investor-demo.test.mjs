import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const fixture = await readFile(new URL("../scripts/demo-fixture.mjs", import.meta.url), "utf8");
const seed = await readFile(new URL("../scripts/demo-seed.mjs", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8");
const search = await readFile(new URL("../app/components/workspace-search.tsx", import.meta.url), "utf8");

test("investor fixture is deterministic, synthetic, and representative", () => {
  assert.match(fixture, /ws_yc_demo_acme/);
  assert.equal((fixture.match(/file\("/g) ?? []).length, 4);
  for (const kind of ['"doc"', '"sheet"']) assert.match(fixture, new RegExp(kind));
  for (const signal of ["Approved enterprise pricing", "Outdated draft", "Final enterprise launch date", "Draft enterprise launch date"]) assert.match(fixture, new RegExp(signal, "i"));
  assert.doesNotMatch(fixture, /@gmail\.com|@openai\.com|minhwi|jeheon/i);
});

test("seed resets only the dedicated demo workspace and never prints credentials", () => {
  assert.match(seed, /DELETE FROM source_files WHERE workspace_id=/);
  assert.match(seed, /randomBytes\(24\)/);
  assert.match(seed, /mode: 0o600/);
  assert.doesNotMatch(seed, /console\.log\([^)]*apiKey/);
});

test("demo UI exposes the evidence, trace, receipt, REST, and MCP story", () => {
  assert.match(dashboard, /Permission-aware retrieval|Built for agents/);
  assert.match(dashboard, /POST \/v1\/search/);
  assert.match(dashboard, /tools\/list · tools\/call/);
  assert.match(search, /Inspect retrieval trace/);
  assert.match(search, /Open search receipt/);
  assert.match(search, /Exact evidence preview/);
  assert.match(search, /no semantic claims/i);
});

test("the focused demo asks one pricing and launch question", () => {
  assert.match(fixture, /What is our current enterprise pricing and launch date/);
  assert.match(search, /What is our current enterprise pricing and launch date/);
  const corePromise = readFile(new URL("../lib/workspace-search/core.ts", import.meta.url), "utf8");
  return corePromise.then((core) => assert.match(core, /QUERY_STOP_WORDS/));
});
