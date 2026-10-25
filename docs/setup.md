# Setup

## Local development

Requires Node 22.13 or newer (CI uses Node 24).

```bash
npm ci
cp .env.example .env.local      # then fill in values locally; never commit them
npm run dev                     # http://localhost:3000
```

Checks, as CI runs them:

```bash
npm run typecheck
npm run lint
npm run db:validate             # migrations are numbered, non-empty, non-destructive
npm test                        # builds the Worker, then runs node --test tests/*.test.mjs
```

`node --test tests/*.test.mjs` alone is faster once `dist/` exists; the
rendered-page tests import the built Worker from it. Repository-level tests
apply every migration to an in-memory SQLite database through `node:sqlite`, so
they need no Cloudflare account. `npm run benchmark:search` times the search
path on synthetic data.

Plain local vinext does not emulate the hosting platform's identity headers or
its D1 binding, so the full sign-in, OAuth, and indexing flow needs a hosted
preview.

## Google Cloud

In one Cloud project (details in
[operations/google-console-actions.md](operations/google-console-actions.md)):

1. Enable the Drive, Docs, Sheets, Slides, and Picker APIs.
2. Configure the OAuth consent screen with exactly one scope,
   `https://www.googleapis.com/auth/drive.file`.
3. Create an OAuth Web client. Register
   `http://localhost:3000/api/connectors/google-drive/callback` for local work and
   `<origin>/api/connectors/google-drive/callback` for production.
4. Create a browser API key restricted to the Picker API.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | The one public origin; the OAuth redirect derives from it |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client |
| `GOOGLE_REDIRECT_URI` | Optional override (set it for local development) |
| `GOOGLE_PICKER_API_KEY`, `GOOGLE_PROJECT_NUMBER` | Google Picker |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes, as 64 hex characters or 43 base64url characters |
| `TOKEN_ENCRYPTION_KEY_PREVIOUS` | Optional, comma-separated retired keys that may still decrypt |
| `API_KEY_PEPPER` | HMAC key for API-key hashes; if unset, one is derived from `TOKEN_ENCRYPTION_KEY` with HKDF |
| `BETA_ACCESS_MODE` | `invited` or `open` |
| `BETA_INVITE_PEPPER`, `BETA_ADMIN_EMAILS` | Invitation hashing and admin accounts |
| `INTERNAL_ADMIN_TOKEN` | Bearer token for `/api/internal/metrics` |
| `INDEXING_SUBREQUEST_BUDGET` | Optional per-hop Workers subrequest budget (default 45) |

`/api/readiness` reports which required values are missing (names only, never
values) and whether D1 answers.

## Deployment

The app deploys as a Cloudflare Worker with a D1 binding named `DB`
(`.openai/hosting.json`). The build copies `drizzle/` into `dist/.openai/`, and
the hosting platform applies the migrations in order. Every migration is
additive, so rolling back the application does not require rolling back the
schema. Set the variables above as hosted secrets before the first deploy.
