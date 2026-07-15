# Vrtbrate

## Open the updated local website

[Open Find Anything](http://localhost:3000/app)

You can also double-click `Open Find Anything.webloc` in this project folder. The stable `/app` address lists your workspaces, so it does not depend on a workspace ID.

Vrtbrate is a permission-aware retrieval platform for AI agents. Week 1 focuses only on authenticated users, workspaces, Google Drive authorization, durable indexing, connection status, authorized file visibility, and safe disconnect.

The repository currently provides:

- an interactive landing-page playground backed by a 105-record synthetic corpus;
- deterministic full-text retrieval that returns no results for unrelated input;
- separate Search Results, Coverage Report, and Retrieval Trace layers;
- structural citations for documents, slides, PDFs, and spreadsheets;
- 20-result pagination and Find All behavior across more than three matches;
- exportable JSON retrieval records;
- typed retrieval, permission, file, evidence, trace, coverage, and receipt contracts;
- prototype REST routes and proposed MCP documentation;
- Trust, pricing, privacy, legal-review, support, status, onboarding-demo, and developer-documentation routes;
- health/readiness endpoints and production architecture/security documentation.
- privacy-safe analytics contracts, protected founder-metrics output, configurable plans, metering and experiment schemas;
- investor-update generation, customer-discovery workflow, launch checklists, and an editable data room.

Phase 1 now includes real Google OAuth/PKCE routes, encrypted credential persistence, complete Drive inventory pagination, Workspace export/download adapters, PDF page extraction, and durable D1 indexing tables. These are **not live on the hosted site until Google credentials, restricted-scope verification, the encryption key, and D1 migration are configured and an end-to-end sync succeeds**.

It does **not** currently provide query-time Drive permission revalidation, incremental change processing, embeddings, a vector database, immutable receipts, or a production-deployed MCP server. The authenticated local app does provide workspace-isolated retrieval over durable Drive records, durable traces and receipts, and exact structural locations when the corresponding Google Docs, Slides, and Sheets APIs are enabled. The public playground remains synthetic and isolated from authenticated workspace data.

## Stack and deployment

- Next.js 16 and React 19
- TypeScript
- vinext and Vite
- OpenAI Sites with Cloudflare Worker-compatible output
- Cloudflare D1/Drizzle schema and migration for the Phase 1 connector

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

## Week 1 local setup

1. Install Node 22+ and run `npm ci`.
2. Copy `.env.example` to `.env.local` and replace placeholders locally only.
3. Create a Google Cloud project, enable the Drive API, configure the OAuth consent screen and test users, then create an OAuth Web client.
4. For local testing, register `http://localhost:3000/api/connectors/google-drive/callback` and set it as `GOOGLE_REDIRECT_URI`.
5. Generate a 32-byte `TOKEN_ENCRYPTION_KEY` as 64 hexadecimal characters or 43-character base64url.
6. Generate the D1 migration with `npm run db:generate`; the committed migration is under `drizzle/`.
7. Run `npm run dev`, sign in through the Sites authentication boundary, create a workspace, and connect Drive.

Plain local vinext does not emulate the Sites identity headers or production D1 automatically. Use a Sites preview/deployment for the complete hosted authentication/OAuth flow.

## Google OAuth local verification

- Scope requested: `https://www.googleapis.com/auth/drive.readonly`.
- Local callback: `http://localhost:3000/api/connectors/google-drive/callback`.
- Set `GOOGLE_REDIRECT_URI` to that exact value in `.env.local` and register the same URI on the Google OAuth Web client.
- Keep `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` in `.env.local`; never commit their values.
- Local vinext still needs a D1-compatible development binding and authenticated-user headers, so the callback setting alone does not emulate the complete Sites environment.

## Google OAuth production setup

- Attach and activate a custom domain in Sites before registering the production callback with Google.
- Planned custom-domain callback: `https://app.findanything.dev/api/connectors/google-drive/callback`.
- Configure the production `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, exact custom-domain `GOOGLE_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` as hosted server secrets.
- Because `drive.readonly` is restricted, complete Google verification and any required security assessment before public use.

See [Week 1 scope](docs/MVP_SCOPE.md), [Google Drive setup](docs/google-drive-mvp.md), and [manual setup](MANUAL_SETUP.md).

## Routes

- `/` — product site and sample retrieval playground
- `/docs` — REST and proposed MCP contracts
- `/trust` — current and planned trust, privacy, and security controls
- `/pricing`, `/privacy`, `/terms`, `/support`, `/status` — public beta-preparation surfaces
- `/app` — safe synthetic onboarding and workspace shell
- `/app` — authenticated workspace creation and listing
- `/app/workspaces/:workspaceId` — member-authorized Drive connection, indexing status, and file inventory
- `/api/workspaces` — authenticated workspace list/create
- `/api/workspaces/:workspaceId` — member-authorized workspace dashboard data
- `/api/workspaces/:workspaceId/google-drive` — connection status, authorized files, and owner-only disconnect
- `/api/connectors/google-drive/connect` — workspace-scoped OAuth start
- `/api/connectors/google-drive/callback` — state/PKCE validated OAuth callback
- `/api/connectors/google-drive/sync` — workspace-scoped inventory and extraction
- `/api/health`, `/api/readiness` — actual demo health and production dependency state
- `/api/retrieval/search` — ranked sample-corpus retrieval
- `/api/retrieval/find-all` — paginated sample-corpus retrieval
- `/api/retrieval/traces/:traceId` — generated prototype trace
- `/api/retrieval/receipts/:receiptId` — generated prototype record
- `/api/workspaces/:workspaceId/coverage` — sample coverage
- `/api/connectors/google-drive/connect` — explicit 501 placeholder
- `/api/connectors/google-drive/sync` — explicit 501 placeholder

## Production plans

- [Google Drive MVP](docs/google-drive-mvp.md)
- [Custom-domain setup](docs/custom-domain-setup.md)
- [Retrieval architecture](docs/retrieval-architecture.md)
- [Manual production setup](MANUAL_SETUP.md)
- [Security policy](SECURITY.md) and [threat model](THREAT_MODEL.md)
- [Tutorial production package](tutorial-video/README.md)

`npm audit --omit=dev` currently reports two moderate PostCSS advisories nested beneath Next.js. The suggested automated fix is a breaking downgrade and was not applied; track the upstream Next.js dependency update before public beta.

Copy `.env.example` to `.env.local` for local URL configuration. Never commit secrets.
