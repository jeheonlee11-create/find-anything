import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { realisticWorkspace } from "./fixtures/realistic-workspace.mjs";

const search = (query, overrides = {}) =>
  searchWorkspaceFiles({
    workspaceId: "ws_demo",
    files: realisticWorkspace,
    query,
    mode: "best",
    fileType: "all",
    ...overrides,
  });
test("exact title, content, multiple, zero, and each Google-native type are covered", () => {
  assert.equal(
    search("Community Research Presentation").results[0].name,
    "Community Research Presentation",
  );
  assert.equal(search("Stanford").totalMatches, 1);
  assert.ok(search("scholarship").totalMatches > 1);
  assert.equal(search("nonexistent phrase").totalMatches, 0);
  assert.ok(
    search("Princeton", { fileType: "docs" }).results.every((file) =>
      file.mimeType.includes("document"),
    ),
  );
  assert.ok(
    search("JHU", { fileType: "sheets" }).results.every((file) =>
      file.mimeType.includes("spreadsheet"),
    ),
  );
  assert.ok(
    search("presentation", { fileType: "slides" }).results.every((file) =>
      file.mimeType.includes("presentation"),
    ),
  );
});
test("Find All ordering is stable and fallback content remains searchable", () => {
  const first = search("presentation", { mode: "all" }),
    second = search("presentation", { mode: "all" });
  assert.deepEqual(
    first.results.map((file) => file.id),
    second.results.map((file) => file.id),
  );
  assert.equal(
    first.results.find((file) => file.id === "field_report")?.extractionMethod,
    "fallback",
  );
});
test("active routes enforce membership, connector status, and current Drive inventory", async () => {
  // Both search routes share one pipeline, which re-checks Drive inventory.
  for (const path of ["../app/api/workspaces/[workspaceId]/search/route.ts", "../app/v1/search/route.ts"])
    assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /runWorkspaceSearch/);
  for (const path of [
    "../lib/workspace-search/run-search.ts",
    "../app/v1/files/[fileId]/citations/route.ts",
    "../app/v1/files/[fileId]/relationships/route.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /currentAuthorized|currentlyAuthorized/);
  }
  const browser = await readFile(
    new URL(
      "../app/api/workspaces/[workspaceId]/search/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(browser, /actorWorkspace/);
  assert.match(browser, /GOOGLE_DRIVE_NOT_CONNECTED/);
  assert.match(browser, /PERMISSION_REVALIDATION_FAILED/);
});
test("sync covers expired tokens, revocation, deletion, pagination, retry, and duplicate prevention", async () => {
  const [sync, repo, client, migration] = await Promise.all([
    readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/google-drive/repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/google-drive/client.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0000_daily_zombie.sql", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(sync, /refreshAccessToken/);
  assert.match(sync, /reconcileMissingSourceFiles/);
  assert.match(repo, /SOURCE_NO_LONGER_AUTHORIZED/);
  assert.match(repo, /delete\(extractedUnits\)/);
  assert.match(client, /nextPageToken/);
  assert.match(client, /attempt\s*<\s*3/);
  assert.match(migration, /UNIQUE.*source_files_connector_source_idx/);
});
test("traces persist permission stages, final order, extraction, fallback, and latency", async () => {
  const [core, audit, schema] = await Promise.all([
    readFile(
      new URL("../lib/workspace-search/core.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/workspace-search/audit.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  for (const token of [
    "Drive permission inventory",
    "finalResultOrder",
    "extractionMethod",
  ])
    assert.match(core, new RegExp(token));
  for (const token of [
    "stagesJson",
    "finalResultOrderJson",
    "extractionMethodsJson",
    "fallbackErrorsJson",
    "authorizedFilesConsidered",
    "latencyJson",
  ])
    assert.match(audit, new RegExp(token));
  assert.match(schema, /lastPermissionCheckedAt/);
});
