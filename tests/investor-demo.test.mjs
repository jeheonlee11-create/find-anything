import assert from "node:assert/strict";
import test from "node:test";
import { queryTerms } from "../lib/workspace-search/matching.ts";
import { readFile } from "node:fs/promises";

const fixture = await readFile(new URL("../lib/demo/acme-fixture.ts", import.meta.url), "utf8");
const seed = await readFile(new URL("../scripts/demo-seed.mjs", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/components/workspace-dashboard.tsx", import.meta.url), "utf8");
const search = await readFile(new URL("../app/components/workspace-search.tsx", import.meta.url), "utf8");
const conflicts = await readFile(new URL("../app/components/search-conflicts.tsx", import.meta.url), "utf8");
const productionSeed = await readFile(new URL("../lib/demo/production-seed.ts", import.meta.url), "utf8");
const productionRoute = await readFile(new URL("../app/api/internal/acme-demo/route.ts", import.meta.url), "utf8");

test("investor fixture is deterministic, synthetic, and representative", () => {
  assert.match(fixture, /ws_yc_demo_acme/);
  assert.equal((fixture.match(/file\("/g) ?? []).length, 7);
  for (const name of ["Pricing Draft.pdf", "Pricing Final.pdf", "Sales Playbook.docx", "Launch Plan Draft.docx", "Launch Plan Final.docx", "Security Review.pdf", "API Version.md"]) assert.match(fixture, new RegExp(name.replace(".", "\\.")));
  for (const signal of ["$120,000 per year", "$25,000 one-time", "$95,000 per year", "September 15, 2026", "September 1, 2026", "Current production version: v1.8.0"]) assert.match(fixture, new RegExp(signal.replaceAll("$", "\\$"), "i"));
  assert.doesNotMatch(fixture, /@gmail\.com|@openai\.com|minhwi|jeheon/i);
});

test("seed resets only the dedicated demo workspace and never prints credentials", () => {
  assert.match(seed, /DELETE FROM source_files WHERE workspace_id=/);
  assert.match(seed, /randomBytes\(24\)/);
  assert.match(seed, /mode: 0o600/);
  assert.doesNotMatch(seed, /console\.log\([^)]*apiKey/);
  assert.match(seed, /SOURCE_NO_LONGER_AUTHORIZED/);
  assert.match(seed, /conflict_demo_pricing/);
  assert.match(seed, /conflict_demo_launch/);
  assert.match(seed, /authoritativeFileId: demoFiles\[0\]\.id/);
});

test("demo UI exposes the evidence, trace, receipt, REST, and MCP story", () => {
  assert.match(dashboard, /Permission-aware retrieval|Built for agents/);
  assert.match(dashboard, /POST \/v1\/search/);
  assert.match(dashboard, /tools\/list · tools\/call/);
  assert.match(search, /Inspect retrieval trace/);
  assert.match(search, /Open search receipt/);
  assert.match(search, /Exact evidence preview/);
  assert.match(search, /no semantic claims/i);
  assert.match(search, /<span className="page-badge">Answer<\/span>/);
  assert.match(search, /Why this ranked/);
  assert.match(search, /newer, approved, and explicitly marked authoritative/);
  assert.match(search, /Replay, trace, receipt, diff, and raw records/);
  assert.match(search, /data\.coverage\.snapshot\.incompleteReasons/);
  assert.match(search, /<SearchConflicts key=\{data\.searchId\}/);
  assert.match(search, /Coverage partial/);
  assert.match(conflicts, /formatConflictValue/);
});

test("the focused demo supports pricing and launch questions", () => {
  assert.match(fixture, /What is our current enterprise pricing/);
  assert.match(fixture, /When are we launching/);
  assert.match(search, /What is our current enterprise pricing and launch date/);
  // The natural-language demo question reduces to its content words.
  assert.deepEqual(queryTerms("What is our current enterprise pricing and launch date?"), ["current", "enterprise", "pricing", "launch", "date"]);
});

test("production demo seed is admin-only, target-confirmed, credential-free, and non-destructive", () => {
  assert.match(productionRoute, /requireBetaAdmin/);
  assert.match(productionRoute, /confirmWorkspaceId/);
  assert.match(productionSeed, /confirmedWorkspaceId !== DEMO_WORKSPACE_ID/);
  assert.match(productionSeed, /DEMO_WORKSPACE_OWNER_MISMATCH/);
  assert.doesNotMatch(productionSeed, /delete\(|DELETE FROM|randomBytes|apiKey|clientSecret/);
  assert.match(productionSeed, /accessTokenCiphertext:\s*"demo-fixture-no-token"/);
  assert.match(productionSeed, /indexed !== 7 \|\| inaccessible !== 1/);
  assert.match(productionSeed, /SOURCE_NO_LONGER_AUTHORIZED/);
});
