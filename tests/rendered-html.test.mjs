import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("renders public product, growth, help, and trust routes with truthful disclosures", async () => {
  for (const [path, pattern] of [
    ["/", /Retrieval evidence for AI agents/i],
    ["/docs", /Retrieval API contract/i],
    ["/trust", /Trust starts with an honest retrieval boundary/i],
    ["/pricing", /free during the public beta/i],
    ["/privacy", /Collect less/i],
    ["/terms", /Legal review required/i],
    ["/support", /production support inbox has not been configured/i],
    ["/status", /Demo retrieval is operational/i],
    ["/beta", /Controlled beta · Design partners/i],
    ["/mcp", /Implemented locally/i],
    ["/google-drive", /Google Drive · Public beta/i],
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
  assert.match(disconnect, /workspace\.role\s*!==\s*"owner"/);
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
        new URL("../lib/security/secret-box.ts", import.meta.url),
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
  assert.match(oauth, /code_challenge_method:\s*"S256"/);
  assert.match(oauth, /drive\.file/);
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

test("client analytics only sends from the configured application origin", async () => {
  const source = await readFile(new URL("../lib/analytics/client.ts", import.meta.url), "utf8");
  assert.match(source, /NEXT_PUBLIC_APP_URL/);
  assert.match(source, /window\.location\.origin!==configuredOrigin/);
  assert.match(source, /if\(configuredOrigin&&window\.location\.origin!==configuredOrigin\)return/);
});

test("founder metrics fail closed when admin authorization is absent", async () => {
  const response = await request("/api/internal/metrics");
  assert.equal(response.status, 404);
});

test("public beta requests reject malformed input and silently absorb bot traps", async () => {
  const malformed = await request("/api/beta/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "A", startedAt: Date.now() - 5_000 }),
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "INVALID_REQUEST");

  const trapped = await request("/api/beta/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ website: "https://spam.invalid", startedAt: Date.now() - 5_000 }),
  });
  assert.equal(trapped.status, 202);
  assert.equal((await trapped.json()).submitted, true);
});

test("public marketing events use a strict privacy-safe allowlist", async () => {
  const invalid = await request("/api/marketing/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "private_document_opened", anonymousId: "test" }),
  });
  assert.equal(invalid.status, 400);
  const source = await readFile(new URL("../app/api/marketing/events/route.ts", import.meta.url), "utf8");
  assert.match(source, /demo_viewed.*beta_access_clicked.*demo_booking_clicked/);
  assert.match(source, /rateLimit\(actorId, "marketing_event", 30, 3600\)/);
  assert.doesNotMatch(source, /query|filename|documentContent|accessToken/i);
});

test("access requests encrypt email, deduplicate, and remain admin-only", async () => {
  const [repository, schema, admin] = await Promise.all([
    readFile(new URL("../lib/beta/repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/beta/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(repository, /encryptSecret\(input\.email/);
  assert.match(repository, /emailHash\(input\.email\)/);
  assert.match(repository, /betaAccessRequests\.emailHash/);
  assert.match(schema, /beta_access_requests/);
  assert.match(admin, /requireBetaChatGPTUser/);
  assert.match(admin, /access\.role!=="admin"/);
  const unauthorized = await request("/admin/beta");
  assert.notEqual(unauthorized.status, 200);
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
