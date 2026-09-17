import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCoverageSnapshot } from "../lib/workspace-search/coverage-map.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";
import { reconcileInterruptedRun } from "../lib/google-drive/sync-lifecycle.ts";

// Any value other than "invited" or "open-local-test" makes the invite gate deny
// without touching the database, which is exactly the unapproved-user condition
// this suite needs. It must be set before the first request.
process.env.BETA_ACCESS_MODE = "gate-denies-for-test";

const APPROVED_LOOKING_EMAIL = "outsider@example.com";
const AUTHENTICATED = { "oai-authenticated-user-email": APPROVED_LOOKING_EMAIL };

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
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}
function source(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}
/** Runs `body` with every console channel captured, returning what was logged. */
async function withCapturedLogs(body) {
  const lines = [];
  const original = {};
  for (const channel of ["log", "info", "warn", "error", "debug"]) {
    original[channel] = console[channel];
    console[channel] = (...args) => {
      lines.push(args.map((value) => String(value)).join(" "));
    };
  }
  try {
    return { result: await body(), lines };
  } finally {
    for (const channel of Object.keys(original))
      console[channel] = original[channel];
  }
}

test("the homepage renders unauthenticated and claims nothing it cannot measure", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();

  // The primary action enters the unified flow; the returning-user action is present.
  assert.match(html, /Connect Google Drive/);
  assert.match(html, /href="\/connect"/);
  assert.match(html, /Continue with Google/);

  // No invented confidence or coverage metric anywhere.
  assert.doesNotMatch(html, /Confidence\b[^<]{0,20}65/i);
  assert.doesNotMatch(html, /\b\d{1,3}\s*\/\s*100\b/);
  assert.doesNotMatch(
    html,
    /\d{1,3}\s*%\s*(?:coverage|confidence|complete|accurate|accuracy)/i,
  );

  // No prominent standalone sign-in or request-access call to action.
  assert.doesNotMatch(html, /Sign in|Sign up|Request Beta Access/i);

  // Illustrative figures are visibly labelled as synthetic, in visible text.
  // The minimal homepage keeps exactly one synthetic illustration (the hero
  // conflict panel), and it must carry the label.
  const illustrationLabels =
    html.match(
      /Illustration · synthetic example, not measured product output/g,
    ) ?? [];
  assert.equal(illustrationLabels.length, 1);
  assert.match(html, /\$120,000\/year/);
  assert.match(html, /Product film · 45 seconds · synthetic example data/);

  // No claim of Google approval, and no deployment address leaked into copy.
  assert.doesNotMatch(
    html,
    /(?:verified|approved|endorsed) by Google|Google[ -](?:verified|approved)/i,
  );
  assert.doesNotMatch(html, /chatgpt\.site/i);
  // The per-file pivot: the homepage discloses picker-scoped access and the
  // pending brand verification instead of a restricted-scope claim.
  assert.match(html, /only the Drive files you choose/i);
  assert.match(html, /brand verification is pending/i);
});

test("no user-visible surface advertises a long generated deployment address", async () => {
  for (const path of ["/", "/privacy", "/terms", "/trust", "/docs", "/mcp", "/beta/access-required"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /chatgpt\.site/i, path);
  }
});

test("the connect flow requires platform identity before anything else", async () => {
  const response = await request("/connect");
  assert.equal(response.status, 307);
  assert.match(
    response.headers.get("location") ?? "",
    /\/signin-with-chatgpt\?return_to=%2Fconnect$/,
  );
});

test("an unapproved signed-in user reaches the invite-only fallback, never Google", async () => {
  const { result, lines } = await withCapturedLogs(() =>
    request("/connect", { headers: AUTHENTICATED }),
  );
  assert.equal(result.status, 307);
  const location = result.headers.get("location") ?? "";
  assert.match(location, /\/beta\/access-required$/);
  assert.doesNotMatch(location, /accounts\.google\.com/);
  assert.doesNotMatch(location, /oauth/i);
  assert.doesNotMatch(await result.text(), /accounts\.google\.com/);
  // The denial must not name the person or any provider-side state in logs.
  assert.doesNotMatch(lines.join("\n"), new RegExp(APPROVED_LOOKING_EMAIL, "i"));

  // And the fallback itself explains the situation without implying Google state.
  const fallback = await request("/beta/access-required");
  assert.equal(fallback.status, 200);
  const html = await fallback.text();
  // The suite runs under a non-"invited" denying mode, so the fallback shows
  // its account-specific wording; under BETA_ACCESS_MODE=invited the page
  // renders the invite-only wording instead (same honesty guarantees).
  assert.match(html, /cannot connect Google Drive right now/i);
  assert.match(html, /No Google authorization was started/i);
  assert.doesNotMatch(html, /test user|test-user|Google Cloud|consent screen/i);
});

test("the Drive connect API rejects an authenticated but unapproved actor", async () => {
  const response = await request("/api/connectors/google-drive/connect", {
    method: "POST",
    headers: { ...AUTHENTICATED, "content-type": "application/json" },
    body: JSON.stringify({ workspaceId: "ws_not_mine" }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.ok(
    ["BETA_ACCESS_REQUIRED", "CONNECT_ACCESS_REQUIRED"].includes(
      body.error.code,
    ),
    `unexpected code ${body.error.code}`,
  );
  assert.equal(body.authorizationUrl, undefined);
  // Non-revealing: nothing about invitation records or Google-side configuration.
  assert.doesNotMatch(
    JSON.stringify(body),
    /test user|test-user|Google Cloud|consent screen|already (?:has|have|exists)|not invited/i,
  );

  // The gate is asked explicitly in this route, not only inside requireApiActor.
  const route = await source(
    "app/api/connectors/google-drive/connect/route.ts",
  );
  assert.match(route, /resolveConnectAccess/);
  assert.match(route, /CONNECT_ACCESS_DENIED/);
  // The gate decision precedes any authorization request being created.
  assert.ok(
    route.indexOf("resolveConnectAccess") <
      route.indexOf("beginGoogleDriveAuthorization"),
    "the invite gate must be resolved before OAuth begins",
  );
  // Identity, membership, state/PKCE, and encryption are all still in the path.
  assert.match(route, /requireApiActor/);
  const flow = await source("lib/google-drive/connect-flow.ts");
  assert.match(flow, /actorWorkspace\(actor\.actorId, workspaceId\)/);
  assert.match(flow, /sha256\(authorization\.state\)/);
  assert.match(flow, /encryptSecret\(authorization\.verifier\)/);
});

test("the connect journey is one ordered decision, removable in one place", async () => {
  const [page, gate] = await Promise.all([
    source("app/connect/page.tsx"),
    source("lib/beta/access-gate.ts"),
  ]);
  // Measure order inside the handler body, not in the import list.
  const body = page.slice(page.indexOf("export default async function Connect"));
  const identity = body.indexOf("requireChatGPTUser");
  const access = body.indexOf("resolveConnectAccess");
  const workspace = body.indexOf("ensureDefaultWorkspace");
  const oauth = body.indexOf("beginGoogleDriveAuthorization");
  assert.ok(identity >= 0 && access > identity, "identity precedes the gate");
  assert.ok(workspace > access, "the gate precedes workspace creation");
  assert.ok(oauth > workspace, "workspace creation precedes OAuth");

  // Exactly one module decides connect eligibility, and only two callers ask it.
  assert.match(gate, /export async function resolveConnectAccess/);
  const callers = await Promise.all([
    source("app/connect/page.tsx"),
    source("app/api/connectors/google-drive/connect/route.ts"),
  ]);
  for (const caller of callers) assert.match(caller, /access-gate/);

  // Default workspace creation reuses the membership-writing path.
  const repository = await source("lib/workspaces/repository.ts");
  assert.match(repository, /export async function ensureDefaultWorkspace/);
  const ensure = repository.slice(
    repository.indexOf("export async function ensureDefaultWorkspace"),
    repository.indexOf("export async function listActorWorkspaces"),
  );
  assert.match(ensure, /createWorkspace\(actor, DEFAULT_WORKSPACE_NAME\)/);
  assert.match(ensure, /listActorWorkspaces\(actor\.actorId\)/);
  // It must not write memberships itself, so the owner row always comes from
  // createWorkspace and membership checks are never bypassed.
  assert.doesNotMatch(ensure, /insert\(memberships\)|insert\(workspaces\)/);
});

test("private routes require authentication and unapproved users are not leaked into them", async () => {
  for (const [path, returnTo] of [
    ["/app", "%2Fapp"],
    ["/settings", "%2Fsettings"],
    ["/connect", "%2Fconnect"],
  ]) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.match(
      response.headers.get("location") ?? "",
      new RegExp(`/signin-with-chatgpt\\?return_to=${returnTo}$`),
      path,
    );
  }
  assert.notEqual((await request("/admin/beta")).status, 200);

  // Signed in but unapproved: routed to the fallback, never into the product.
  for (const path of ["/app", "/settings"]) {
    const response = await request(path, { headers: AUTHENTICATED });
    assert.equal(response.status, 307, path);
    assert.match(
      response.headers.get("location") ?? "",
      /\/beta\/access-required$/,
      path,
    );
  }

  // Workspace APIs stay closed to anonymous callers.
  for (const path of [
    "/api/workspaces",
    "/api/workspaces/ws_someone_else/google-drive",
  ])
    assert.equal((await request(path)).status, 401, path);
});

test("legacy separate-app-host workspace links redirect into the authenticated product", async () => {
  const collection = await request("/workspaces");
  assert.equal(collection.status, 307);
  assert.match(collection.headers.get("location") ?? "", /\/app$/);
  const single = await request("/workspaces/ws_legacy");
  assert.equal(single.status, 307);
  assert.match(
    single.headers.get("location") ?? "",
    /\/app\/workspaces\/ws_legacy$/,
  );
});

test("access requests are only reported saved when the server confirms persistence", async () => {
  // The bot trap answers 202 but never confirms persistence.
  const trapped = await request("/api/beta/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      website: "https://spam.invalid",
      startedAt: Date.now() - 5_000,
    }),
  });
  assert.equal(trapped.status, 202);
  const trappedBody = await trapped.json();
  assert.equal(trappedBody.submitted, true);
  assert.equal(trappedBody.saved, undefined);

  // A real, valid submission that cannot be stored must not claim it was.
  const unavailable = await request("/api/beta/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fullName: "Real Person",
      email: "person@example.com",
      company: "Example",
      jobTitle: "Engineer",
      companySize: "11-50",
      knowledgeTools: ["Google Drive"],
      usesAiAgents: true,
      willingLimitedFolder: true,
      knowledgeProblem: "We cannot tell which internal document an agent used.",
      intent: "beta",
      startedAt: Date.now() - 5_000,
    }),
  });
  assert.ok(unavailable.status >= 400, `unexpected ${unavailable.status}`);
  const unavailableBody = await unavailable.json();
  assert.equal(unavailableBody.saved, undefined);

  // The client requires the explicit confirmation, not merely a 2xx.
  const form = await source("app/components/beta-access-form.tsx");
  assert.match(form, /result\.saved === true/);
  assert.match(form, /response\.status === 202/);
  assert.doesNotMatch(form, /setState\(response\.ok \? "success"/);

  // Repeat submissions update one row instead of duplicating, and the response
  // is byte-identical either way so it cannot disclose a prior request.
  const [repository, schema, route] = await Promise.all([
    source("lib/beta/repository.ts"),
    source("db/schema.ts"),
    source("app/api/beta/waitlist/route.ts"),
  ]);
  assert.match(repository, /db\.update\(betaAccessRequests\)/);
  assert.match(repository, /return \{ id: existing\.id, created: false \}/);
  assert.match(schema, /uniqueIndex\("beta_access_requests_email_idx"\)/);
  const confirmation = route.match(
    /return NextResponse\.json\(\{ submitted: true, saved: true[\s\S]*?\);/,
  );
  assert.ok(confirmation, "the confirming response should be a single literal");
  assert.doesNotMatch(confirmation[0], /created|duplicate/);
});

test("one workspace cannot reach another workspace's files", () => {
  const file = (id, workspaceId) => ({
    id,
    workspaceId,
    connectorId: `connector_${workspaceId}`,
    sourceId: id,
    name: "Needle plan",
    mimeType: "application/vnd.google-apps.document",
    modifiedAt: "2026-07-01T00:00:00.000Z",
    webViewLink: null,
    indexStatus: "indexed",
    extractionError: null,
    extractionMode: "structured",
    structuralFallbackReason: null,
    units: [
      {
        id: `unit_${id}`,
        unitType: "doc_paragraph",
        text: "needle",
        structuralLocation: {},
        contentHash: id,
      },
    ],
  });
  const result = searchWorkspaceFiles({
    workspaceId: "ws_mine",
    files: [file("mine", "ws_mine"), file("theirs", "ws_theirs")],
    query: "needle",
    mode: "best",
    fileType: "all",
  });
  assert.deepEqual(
    result.results.map((item) => item.id),
    ["mine"],
  );
  assert.doesNotMatch(JSON.stringify(result), /ws_theirs/);
});

test("every workspace-scoped surface resolves membership server-side", async () => {
  for (const path of [
    "app/api/workspaces/[workspaceId]/route.ts",
    "app/api/workspaces/[workspaceId]/google-drive/route.ts",
    "app/api/workspaces/[workspaceId]/search/route.ts",
    "app/api/connectors/google-drive/connect/route.ts",
  ]) {
    const route = await source(path);
    assert.match(
      route,
      /actorWorkspace|requireWorkspaceMember|requireWorkspaceOwner|workspaceDashboard|beginGoogleDriveAuthorization/,
      path,
    );
    assert.match(route, /requireApiActor|requireAuthenticatedUser/, path);
  }
  // The settings UI adds no capability of its own: it calls the same endpoints.
  const panel = await source("app/components/settings-panel.tsx");
  assert.match(panel, /\/api\/workspaces/);
  assert.doesNotMatch(panel, /getDb|drizzle|from "@\/db"/);
});

test("revoked Drive authorization fails closed everywhere it is observable", async () => {
  const snapshot = buildCoverageSnapshot({
    authorization: "reauthorization_required",
    authorizedDiscovered: 0,
    knownInventoryRows: 12,
    indexed: 12,
    searchable: 12,
    failed: 0,
    pending: 0,
    unsupported: 0,
    paginationComplete: false,
    lastSuccessfulSyncAt: "2026-07-20T00:00:00.000Z",
    observedAt: "2026-07-21T00:00:00.000Z",
  });
  assert.equal(snapshot.status, "blocked");
  assert.equal(snapshot.metrics.permissionAccessibility, null);
  assert.ok(
    snapshot.incompleteReasons.some((reason) =>
      /not currently authorized/i.test(reason),
    ),
  );

  const [authorization, searchRoute, sync] = await Promise.all([
    source("lib/workspace-search/authorization.ts"),
    source("app/api/workspaces/[workspaceId]/search/route.ts"),
    source("lib/google-drive/sync.ts"),
  ]);
  assert.match(authorization, /status !== "connected"/);
  assert.match(authorization, /GOOGLE_DRIVE_NOT_CONNECTED/);
  assert.match(searchRoute, /status !== "connected"/);
  assert.match(sync, /invalid_grant/);
  assert.match(sync, /reauthorization_required/);
});

test("the durable indexer still resumes from its persisted checkpoint", () => {
  assert.deepEqual(
    reconcileInterruptedRun(
      { filesDiscovered: 518, paginationComplete: true },
      [
        { indexStatus: "indexed", extractionMode: "structured", trashed: false },
        { indexStatus: "indexed", extractionMode: "fallback", trashed: false },
        { indexStatus: "pending", extractionMode: null, trashed: false },
      ],
    ),
    {
      status: "partial",
      filesDiscovered: 518,
      filesIndexed: 2,
      filesFailed: 0,
      structuredFiles: 1,
      fallbackFiles: 1,
      paginationComplete: true,
    },
  );
});

test("no token, file content, private filename, or provider error reaches a log or a public response", async () => {
  const { lines } = await withCapturedLogs(async () => {
    await request("/");
    await request("/beta/access-required");
    await request("/connect", { headers: AUTHENTICATED });
    await request("/api/connectors/google-drive/connect", {
      method: "POST",
      headers: { ...AUTHENTICATED, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "ws_not_mine" }),
    });
    await request("/api/connectors/google-drive/callback?code=abc&state=def", {
      headers: AUTHENTICATED,
    });
  });
  const logged = lines.join("\n");
  assert.doesNotMatch(
    logged,
    /access_token|refresh_token|Ciphertext|code_verifier|Bearer |ya29\./i,
  );
  assert.doesNotMatch(logged, new RegExp(APPROVED_LOOKING_EMAIL, "i"));

  // The structured log vocabulary cannot carry content, names, or raw errors.
  const log = await source("lib/observability/indexing-log.ts");
  assert.doesNotMatch(
    log,
    /fileName|sanitizedFileName|providerError|errorMessage|query|excerpt|token/i,
  );

  // The new modules log nothing at all and never surface provider strings.
  for (const path of [
    "app/connect/page.tsx",
    "app/settings/page.tsx",
    "lib/beta/access-gate.ts",
    "lib/google-drive/connect-flow.ts",
    "app/api/connectors/google-drive/connect/route.ts",
    "app/components/settings-panel.tsx",
  ]) {
    const contents = await source(path);
    assert.doesNotMatch(contents, /console\.(?:log|info|warn|error|debug)/, path);
    assert.doesNotMatch(
      contents,
      /accessTokenCiphertext|refreshTokenCiphertext/,
      path,
    );
  }
});

test("the public origin is centralized and the OAuth redirect derives from it", async () => {
  const [urls, serverEnv, env] = await Promise.all([
    source("lib/config/urls.ts"),
    source("lib/config/server-env.ts"),
    source(".env.example"),
  ]);
  // One canonical origin; the app defaults to it rather than a separate host.
  assert.match(urls, /NEXT_PUBLIC_SITE_URL/);
  assert.match(urls, /app: originOf\(process\.env\.NEXT_PUBLIC_APP_URL, siteOrigin\)/);
  assert.doesNotMatch(urls, /app\.findanything\.dev/);
  assert.doesNotMatch(urls, /api\.findanything\.dev|docs\.findanything\.dev/);
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_DOCS_URL",
    "NEXT_PUBLIC_MCP_URL",
  ])
    assert.match(urls, new RegExp(key), key);
  // Explicit environment keeps the highest precedence.
  assert.match(
    urls,
    /const explicit = process\.env\.GOOGLE_REDIRECT_URI\?\.trim\(\);\s*if \(explicit\) return explicit;/,
  );
  assert.match(urls, /GOOGLE_DRIVE_CALLBACK_PATH/);
  assert.match(serverEnv, /redirectUri:googleRedirectUri\(\)/);
  assert.match(env, /NEXT_PUBLIC_SITE_URL=https:\/\/findanything\.dev/);
  // The scopes and the OAuth publishing status are untouched by any of this.
  const oauth = await source("lib/google-drive/oauth.ts");
  assert.match(
    oauth,
    /DRIVE_SCOPE="https:\/\/www\.googleapis\.com\/auth\/drive\.file"/,
  );
  assert.equal((oauth.match(/googleapis\.com\/auth\//g) ?? []).length, 1);
  assert.match(oauth, /scope:DRIVE_SCOPE/);

  // No customer-facing copy still points at a separate app or api hostname.
  for (const path of ["app/mcp/page.tsx", "app/docs/page.tsx"]) {
    const page = await source(path);
    assert.doesNotMatch(page, /app\.findanything\.dev|api\.findanything\.dev/, path);
  }
  // No configuration or customer-facing page names any subdomain of the
  // registrable domain: unrelated deployments live there and stay untouched.
  for (const path of [
    "lib/config/urls.ts",
    ".env.example",
    "app/page.tsx",
    "app/settings/page.tsx",
    "app/connect/page.tsx",
    "app/mcp/page.tsx",
    "app/privacy/page.tsx",
  ])
    assert.doesNotMatch(
      await source(path),
      /\/\/[a-z0-9-]+\.findanything\.dev/,
      path,
    );
});

test("settings states plainly what disconnecting deletes and does not invent capabilities", async () => {
  const [panel, repository, disconnectRoute, privacy] = await Promise.all([
    source("app/components/settings-panel.tsx"),
    source("lib/google-drive/repository.ts"),
    source("app/api/workspaces/[workspaceId]/google-drive/route.ts"),
    source("app/privacy/page.tsx"),
  ]);
  // Google revocation is attempted first and aborts the delete on failure.
  assert.match(disconnectRoute, /revokeGoogleToken/);
  assert.match(disconnectRoute, /GOOGLE_REVOCATION_FAILED/);
  assert.match(disconnectRoute, /Nothing was deleted/);
  // Measure order inside the DELETE handler, not in the import list.
  const deleteHandler = disconnectRoute.slice(
    disconnectRoute.indexOf("export async function DELETE"),
  );
  assert.ok(
    deleteHandler.indexOf("revokeGoogleToken") <
      deleteHandler.indexOf("deleteConnectorData"),
    "revocation must precede deletion",
  );
  // Everything the UI claims is deleted is actually deleted.
  for (const table of [
    "unit_embeddings",
    "file_versions",
    "file_relationships",
    "retrieval_conflicts",
    "search_receipts",
    "retrieval_traces",
    "indexing_continuations",
    "indexing_job_attempts",
    "indexing_failures",
    "coverage_receipts",
    "indexing_jobs",
  ])
    assert.match(repository, new RegExp(`delete from ${table}`), table);
  assert.match(repository, /delete\(extractedUnits\)/);
  assert.match(repository, /delete\(sourceFiles\)/);
  assert.match(repository, /delete\(oauthStates\)/);
  assert.match(repository, /delete\(connectors\)/);
  // And the UI is honest about what is kept and what is not self-service.
  assert.match(panel, /Retrieval traces and search receipts/);
  assert.match(panel, /Developer API keys/);
  assert.match(panel, /not yet a self-service/);
  assert.match(privacy, /drive\.file/);
  assert.match(privacy, /AES-GCM/);
  assert.match(privacy, /Refresh tokens never leave the server/);
  assert.match(privacy, /brand\s+verification is pending/);
});

// --- Per-file scope pivot: picker, token boundary, and the open access mode ---

test("the picker token endpoint is guarded, fail-closed, and never ships a refresh token", async () => {
  // Unauthenticated callers are rejected before any Drive state is touched.
  const anonymous = await request(
    "/api/workspaces/ws_x/google-drive/picker-token",
    { method: "POST" },
  );
  assert.ok([401, 404].includes(anonymous.status), `status ${anonymous.status}`);

  const route = await source(
    "app/api/workspaces/[workspaceId]/google-drive/picker-token/route.ts",
  );
  assert.match(route, /requireApiActor/);
  assert.match(route, /actorWorkspace\(actor\.actorId, workspaceId\)/);
  // Missing picker configuration is a clean 503, not a broken picker.
  assert.match(route, /PICKER_NOT_CONFIGURED/);
  // Only the short-lived access token crosses to the browser.
  assert.match(route, /usableAccessToken/);
  assert.doesNotMatch(route, /refreshToken|refresh_token/);
  assert.match(route, /"cache-control": "no-store"/);
});

test("the content security policy admits exactly the picker's origins", async () => {
  const config = await source("next.config.ts");
  assert.match(config, /script-src 'self' 'unsafe-inline' https:\/\/apis\.google\.com/);
  assert.match(config, /frame-src 'self' https:\/\/docs\.google\.com/);
  // connect-src stays first-party: the picker iframe talks to Google itself.
  assert.match(config, /connect-src 'self'/);
});

test("the dashboard offers multi-select picking and syncs after a pick", async () => {
  const dashboard = await source("app/components/workspace-dashboard.tsx");
  assert.match(dashboard, /MULTISELECT_ENABLED/);
  assert.match(dashboard, /apis\.google\.com\/js\/api\.js/);
  assert.match(dashboard, /Add files from Drive/);
  // A successful pick triggers indexing; picked IDs never travel through our API.
  assert.match(dashboard, /Action\.PICKED[\s\S]{0,400}void sync\(\)/);
});

test("the open access mode admits everyone without weakening moderation or admins", async () => {
  const gate = await source("lib/beta/repository.ts");
  assert.match(gate, /BETA_ACCESS_MODE === "open"/);
  // Suspended rows still deny: open mode reuses the existing-user branch.
  assert.match(gate, /existing\.status === "active"/);
  // Admins still come from BETA_ADMIN_EMAILS, not from open mode.
  assert.match(gate, /BETA_ADMIN_EMAILS/);
  // Any other value still fails closed (the suite runs under such a value and
  // the unapproved-user tests above prove the denial behavior end to end).
  assert.match(gate, /!== "invited" && !openMode/);
});
