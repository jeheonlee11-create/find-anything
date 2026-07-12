# Find Anything

Find Anything is a developer-facing prototype for permission-aware, coverage-accounted retrieval across private files.

The repository currently provides:

- an interactive landing-page playground backed by a local sample corpus;
- deterministic full-text retrieval that returns no results for unrelated input;
- separate Search Results, Coverage Report, and Retrieval Trace layers;
- structural citations for documents, slides, PDFs, and spreadsheets;
- paginated Find All behavior over the sample corpus;
- exportable JSON retrieval records;
- typed retrieval, permission, file, evidence, trace, coverage, and receipt contracts;
- prototype REST routes and proposed MCP documentation;
- Trust and developer-documentation routes.

It does **not** currently provide live Google Drive OAuth, connector synchronization, embeddings, a vector database, production permission enforcement, durable traces, immutable receipts, or a production MCP server.

## Stack and deployment

- Next.js 16 and React 19
- TypeScript
- vinext and Vite
- OpenAI Sites with Cloudflare Worker-compatible output
- optional Cloudflare D1/Drizzle scaffolding; no production database is currently enabled

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

## Routes

- `/` — product site and sample retrieval playground
- `/docs` — REST and proposed MCP contracts
- `/trust` — current and planned trust, privacy, and security controls
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

Copy `.env.example` to `.env.local` for local URL configuration. Never commit secrets.

