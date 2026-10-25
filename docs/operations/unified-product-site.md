# The unified product site

One deployment, one origin. The public pages are served from `/` and the
authenticated product from `/app` by the same Sites application (project
`appgprj_…` in `.openai/hosting.json`). There is no separate app host and no
second database.

## How the current beta operates

Find Anything is **invite-only**. Two gates apply, in this order, and they are
independent:

1. **Platform identity.** Sign-in belongs to the ChatGPT Sites platform. The
   application trusts the `oai-authenticated-user-email` header and redirects
   anonymous visitors to `/signin-with-chatgpt` with a safe relative
   `return_to`. The application never issues, stores, or verifies a password.
2. **Internal invite authorization.** `resolveConnectAccess()` in
   `lib/beta/access-gate.ts` is the single decision point. It reads
   `BETA_ACCESS_MODE` and the `beta_users` / `beta_invitations` tables. With
   `BETA_ACCESS_MODE=invited`, only an approved invitation (or a
   `BETA_ADMIN_EMAILS` address) is allowed. Any other value fails closed.

Sign-in is therefore an invisible step inside a journey, not a marketing call to
action. The site's primary call to action is **Connect Google Drive**.

## The connect journey

`/connect` (`app/connect/page.tsx`) is a normal navigation target and runs in a
fixed order:

1. Require platform identity — redirect to sign-in with `return_to=/connect`.
2. Ask the invite gate, **before any Google OAuth request exists**.
3. If approved: ensure the actor has a workspace (`ensureDefaultWorkspace`,
   which reuses `createWorkspace` so the owner membership row is always written),
   then start Drive OAuth via `beginGoogleDriveAuthorization`. Google's callback
   lands the user inside that private workspace.
4. If denied: redirect to `/beta/access-required`, which explains that access is
   invite-only and offers the real request-access form. That form reports success
   only when the server confirms persistence, and nothing on that page discloses
   whether an email has an account, an invitation, or any provider-side state.

`POST /api/connectors/google-drive/connect` asks the same gate explicitly before
creating an authorization request, so an authenticated but unapproved actor
cannot start Drive OAuth through the API either.

### Removing the invite gate later

Make `resolveConnectAccess()` always return an `allowed: true` result — or delete
`lib/beta/access-gate.ts` and its two call sites. No caller branches on *why*
access was denied, so nothing else has to be restructured. Platform identity,
workspace membership checks, OAuth state/PKCE validation, and token encryption
are separate concerns and must stay.

## Google verification status

The connector requests exactly one scope,
`https://www.googleapis.com/auth/drive.file` (`lib/google-drive/oauth.ts`): the
app can read only the files a user selects in Google's picker. That scope is
non-sensitive, so the restricted-scope review and CASA assessment required by the
earlier `drive.readonly` design no longer apply. Google brand verification is
still pending and nothing in the product may claim otherwise; the homepage says
so directly.

`BETA_ACCESS_MODE` decides who may connect: `invited` admits only approved
invitations, `open` admits any signed-in user (suspended users stay blocked).
If the OAuth client is in Testing mode, each tester's Google account must also be
added as a test user — see
[Google Cloud Console actions](google-console-actions.md).

## Required production environment values

Public origin (one value is the source of truth):

| Name | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | e.g. `https://findanything.dev`. Everything else derives from it. |
| `NEXT_PUBLIC_APP_URL` | no | Defaults to `NEXT_PUBLIC_SITE_URL`. Set only if the product genuinely moves to its own host. |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_MCP_URL` | no | Same: default to the site origin, kept for compatibility. |

Google Drive connector (server secrets):

| Name | Required | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes | Web OAuth client in the same project as the enabled APIs. |
| `GOOGLE_CLIENT_SECRET` | yes | Server secret. |
| `GOOGLE_REDIRECT_URI` | no | Highest precedence when set. When unset it derives as `<NEXT_PUBLIC_SITE_URL>/api/connectors/google-drive/callback`. Set it explicitly for local development. |
| `TOKEN_ENCRYPTION_KEY` | yes | Exactly 32 bytes, hex (64 chars) or base64url (43 chars). Encrypts tokens at rest. |

Access control and product secrets:

| Name | Required | Notes |
| --- | --- | --- |
| `BETA_ACCESS_MODE` | yes | `invited` in production. Any other value fails closed. |
| `BETA_INVITE_PEPPER` | yes | Keyed hash for invitation and access-request emails. |
| `BETA_ADMIN_EMAILS` | yes | Comma-separated admin allowlist; may be empty but must be present. |
| `API_KEY_PEPPER` | yes | Hashes developer API keys. |
| `INTERNAL_ADMIN_TOKEN` | if used | Only for the legacy founder metrics endpoint. |
| `SUPPORT_EMAIL`, `PRIVACY_EMAIL` | optional | Contact surfaces. |
| `INDEXING_QUEUE_*` | optional | External managed-Queue bridge; disabled by default. |

`GET /api/readiness` reports which required names are missing and whether the
Google redirect URI came from the environment or was derived. It never returns
secret values.

Bindings: the D1 database binding `DB` (declared in `.openai/hosting.json`). One
database only — all migrations in `drizzle/` are forward-only and additive.

## Compatibility

- `/app` and `/app/workspaces/<id>` are unchanged.
- `/workspaces` and `/workspaces/<id>`, which only made sense on a separate app
  host, redirect into `/app`. The redirect grants nothing: the target still
  enforces identity, beta access, and workspace membership.
- Existing users, workspaces, Drive connections, indexes, traces, receipts, and
  access requests are untouched. No schema change was required.
- `marketing-site/` stays deployed and unmodified until an approved cutover; see
  [custom-domain cutover](custom-domain-cutover.md).
