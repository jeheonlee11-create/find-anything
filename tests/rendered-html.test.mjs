import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runSampleRetrieval } from "../lib/retrieval/core.ts";

process.env.BETA_ACCESS_MODE = "open-local-test";

let workerPromise;
async function worker() {
  if (!workerPromise) {
    const url = new URL("../dist/server/index.js", import.meta.url);
    url.searchParams.set("test", `${process.pid}-${Date.now()}`);
    workerPromise = import(url.href).then((module) => module.default);
  }
  return workerPromise;
}
async function request(path, init = {}) {
  const handler = await worker();
  return handler.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}
async function search(query, extra = {}) {
  return runSampleRetrieval({ query, ...extra });
}

test("renders public product, growth, help, and trust routes with truthful disclosures", async () => {
  for (const [path, pattern] of [
    ["/", /Interactive prototype/i],
    ["/docs", /Retrieval API contract/i],
    ["/trust", /Trust starts with accurate claims/i],
    ["/pricing", /Pre-beta/i],
    ["/privacy", /Legal review required/i],
    ["/terms", /Legal review required/i],
    ["/support", /production support inbox has not been configured/i],
    ["/status", /Demo retrieval is operational/i],
    ["/beta", /Waitlist not yet connected/i],
    ["/mcp", /Implemented locally/i],
    ["/google-drive", /Google Drive · Private beta/i],
    ["/use-cases", /Concrete workflows/i],
    ["/changelog", /without inflated claims/i],
    ["/contact", /Provider setup required/i],
    ["/help", /Help center/i],
  ]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), pattern);
  }
});

test("signup, sign-in, protected application, and sign-out use the host session", async () => {
  const anonymous = await request("/app");
  assert.equal(anonymous.status, 307);
  assert.match(
    anonymous.headers.get("location") ?? "",
    /\/signin-with-chatgpt\?return_to=%2Fapp$/,
  );
  const signIn = await request("/sign-in");
  assert.equal(signIn.status, 200);
  assert.match(await signIn.text(), /Sign in with ChatGPT/);
  const authenticated = await request("/app", {
    headers: {
      "oai-authenticated-user-email": "developer@example.com",
      "oai-authenticated-user-full-name": "Demo%20Developer",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    },
  });
  assert.equal(authenticated.status, 200);
  const html = await authenticated.text();
  assert.match(html, /Create your Find Anything workspace/i);
  assert.match(html, /Demo Developer/);
  assert.match(html, /signout-with-chatgpt/);
});

test("workspace and connector APIs fail closed and validate input before storage", async () => {
  const anonymousWorkspace = await request("/api/workspaces");
  assert.equal(anonymousWorkspace.status, 401);
  const anonymousConnector = await request(
    "/api/connectors/google-drive/connect",
    { method: "POST" },
  );
  assert.equal(anonymousConnector.status, 401);
  const headers = {
    "oai-authenticated-user-email": "developer@example.com",
    "content-type": "application/json",
  };
  const invalidWorkspace = await request("/api/workspaces", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "x" }),
  });
  assert.equal(invalidWorkspace.status, 400);
  const missingWorkspace = await request(
    "/api/connectors/google-drive/connect",
    { method: "POST", headers, body: "{}" },
  );
  assert.equal(missingWorkspace.status, 400);
  assert.equal(
    (await missingWorkspace.json()).error.code,
    "WORKSPACE_REQUIRED",
  );
  const callback = await request("/api/connectors/google-drive/callback", {
    headers: { "oai-authenticated-user-email": "developer@example.com" },
  });
  assert.equal(callback.status, 400);
  assert.equal((await callback.json()).error.code, "INVALID_OAUTH_CALLBACK");
  const disconnect = await request("/api/workspaces/ws_other/google-drive", {
    method: "DELETE",
  });
  assert.equal(disconnect.status, 401);
});

test("Week 1 workspace isolation, expiry refresh, callback state, and revocation paths are wired", async () => {
  const [workspaceRepo, driveRepo, sync, callback, disconnect, scope] =
    await Promise.all([
      readFile(
        new URL("../lib/workspaces/repository.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../lib/google-drive/repository.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../app/api/connectors/google-drive/callback/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/workspaces/[workspaceId]/google-drive/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../docs/MVP_SCOPE.md", import.meta.url), "utf8"),
    ]);
  assert.match(workspaceRepo, /memberships\.userId/);
  assert.match(workspaceRepo, /memberships\.workspaceId/);
  assert.match(driveRepo, /connectors\.workspaceId/);
  assert.match(driveRepo, /connectors\.actorId/);
  assert.match(sync, /tokenExpiresAt/);
  assert.match(sync, /refreshAccessToken/);
  assert.match(callback, /record\.actorId\s*!==\s*actor\.actorId/);
  assert.match(
    callback,
    /Date\.parse\(record\.expiresAt\)\s*<=\s*Date\.now\(\)/,
  );
  assert.match(disconnect, /workspace\.role!=="owner"/);
  assert.match(disconnect, /revokeGoogleToken/);
  assert.match(disconnect, /deleteConnectorData/);
  assert.match(scope, /Not in MVP/);
});

test("Google Drive implementation includes state, PKCE, encrypted tokens, complete pagination, and durable migrations", async () => {
  const [oauth, cryptoSource, client, repository, migration] =
    await Promise.all([
      readFile(
        new URL("../lib/google-drive/oauth.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../lib/google-drive/crypto.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../lib/google-drive/client.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../lib/google-drive/repository.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../drizzle/0000_daily_zombie.sql", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(oauth, /code_challenge_method:"S256"/);
  assert.match(oauth, /drive\.readonly/);
  assert.match(cryptoSource, /AES-GCM/);
  assert.match(client, /while\s*\(pageToken\)/);
  assert.match(client, /permissions\(id,type,role/);
  assert.match(repository, /pkceVerifierCiphertext|accessTokenCiphertext/);
  for (const table of [
    "oauth_states",
    "connectors",
    "source_files",
    "file_versions",
    "extracted_units",
    "sync_runs",
  ])
    assert.match(migration, new RegExp("CREATE TABLE.*" + table));
});

test("sample search returns more than three relevant files with structural evidence", async () => {
  const result = await search("air pollution Detroit");
  assert.ok(result.totalMatches > 3);
  assert.equal(result.results.length, 20);
  assert.match(result.results[0].citation, /(Paragraphs|Slide|cells|Page)/);
  assert.equal(result.results[0].permissionStatus, "allowed");
});

test("unrelated query does not return Detroit sample results", async () => {
  const result = await search("hi");
  assert.equal(result.totalMatches, 0);
  assert.deepEqual(result.results, []);
});

test("coverage marks extraction failures as incomplete and warns", async () => {
  const result = await search("air");
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.completenessStatus, "incomplete");
  assert.equal(result.coverage.extractionFailed, 2);
  assert.equal(result.coverage.awaitingIndex, 2);
  assert.ok(
    result.coverage.warnings.some((warning) => /incomplete/i.test(warning)),
  );
});

test("receipt matches results and is labeled exportable rather than immutable", async () => {
  const result = await search("environmental justice");
  assert.equal(result.receipt.label, "Exportable retrieval record");
  assert.equal(result.receipt.returnedEvidence.length, result.results.length);
  assert.equal(result.receipt.prototype, true);
});

test("Find All pagination is stable and non-duplicating across a large result set", async () => {
  const init = (page) =>
    runSampleRetrieval({
      query: "air pollution",
      mode: "find_all",
      page,
      pageSize: 20,
    });
  const first = await init(1);
  const second = await init(2);
  assert.ok(first.totalMatches > 40);
  assert.equal(first.results.length, 20);
  assert.equal(second.results.length, 20);
  assert.equal(
    new Set([...first.results, ...second.results].map((x) => x.file.id)).size,
    40,
  );
});

test("Google Docs-only filtering returns only documents", async () => {
  const result = await search("air pollution", {
    filters: { fileType: "document" },
    mode: "find_all",
    pageSize: 100,
  });
  assert.ok(result.totalMatches > 3);
  assert.ok(
    result.results.every((item) => item.file.mimeType.includes("document")),
  );
});

test("health and readiness fail safely when production dependencies are missing", async () => {
  const health = await request("/api/health");
  assert.equal(health.status, 503);
  assert.equal((await health.json()).status, "degraded");
  const ready = await request("/api/readiness");
  assert.equal(ready.status, 503);
  const body = await ready.json();
  assert.equal(body.ready, false);
  assert.equal(body.features.literalSearch, true);
  assert.equal(body.features.semanticSearch, false);
  assert.ok(body.configuration.missingNames.includes("GOOGLE_CLIENT_ID"));
});

test("analytics requires authentication and uses privacy-safe first-party persistence", async () => {
  const invalid = await request("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "file_content_uploaded", anonymousId: "a" }),
  });
  assert.equal(invalid.status, 401);
  const source = await readFile(new URL("../app/api/analytics/route.ts", import.meta.url), "utf8");
  assert.match(source, /requireAuthenticatedUser/);
  assert.match(source, /requireWorkspaceMember/);
  assert.match(source, /recordBetaEvent/);
  assert.doesNotMatch(source, /POSTHOG|capture\//i);
});

test("founder metrics fail closed when admin authorization is absent", async () => {
  const response = await request("/api/internal/metrics");
  assert.equal(response.status, 404);
});

test("public URLs are environment configurable and contain no personal-name branding", async () => {
  const [config, layout, page] = await Promise.all([
    readFile(new URL("../lib/config/urls.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_DOCS_URL",
    "NEXT_PUBLIC_MCP_URL",
  ])
    assert.match(config, new RegExp(key));
  assert.match(layout, /NEXT_PUBLIC_SITE_URL/);
  assert.doesNotMatch(`${config}${layout}${page}`, new RegExp(["min", "hwi"].join(""), "i"));
});

test("dark mode keeps primary actions readable", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /prefers-color-scheme:dark/);
  assert.match(css, /\.content-page \.button\{background:#caff4a;color:#121411/);
  assert.match(css, /\.trust-grid span,.workspace-search-summary>\*\)\{background:#30352c;color:#f0f2ea/);
  assert.match(css, /\.indexed-files a,.workspace-search-results a\)\{color:#caff4a/);
  assert.match(css, /\.empty-state b\{color:#f0f2ea/);
  assert.match(css, /\.audit-actions :is\(a,button\)\{background:#292d26;color:#f0f2ea/);
});
