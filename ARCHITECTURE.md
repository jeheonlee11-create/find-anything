# Architecture

## Private-beta readiness update

Find Anything uses Next.js-compatible Vinext output on Cloudflare Workers, Sites-owned ChatGPT authentication, D1 with Drizzle migrations, Google OAuth state plus PKCE, AES-GCM token encryption, complete Drive inventory reconciliation, structural Docs/Sheets/Slides extraction, deterministic literal search, permission revalidation, exact citations, retrieval traces, and receipts. Every workspace-facing route derives the actor server-side and checks membership before loading connector or file data.

Private-beta controls add hashed-email invitations, active/disabled/revoked users, server-side access enforcement, first-party D1 analytics, contextual feedback with optional evidence inclusion, operation rate limits, access-change audit records, owner-only Sites access, health/readiness checks, and an admin dashboard without a file-content viewer. Ordinary analytics reject fields whose names indicate queries, filenames, excerpts, content, OAuth data, authorization, tokens, or secrets.

The remaining production dependency is custom-domain Google OAuth. Semantic search and additional connectors remain deliberately disabled.

## Current deployable demo

- Next.js 16, React 19, TypeScript, vinext, OpenAI Sites/Cloudflare Worker runtime.
- Stateless deterministic retrieval over a versioned synthetic corpus.
- Route handlers expose search, Find All, coverage, trace, receipt, health, and readiness contracts.
- No customer identity, tokens, files, billing data, or durable retrieval records are accepted.

## Target production architecture

Browser → authenticated Next.js application → workspace authorization middleware → retrieval service → PostgreSQL full-text/pgvector indexes. Connector jobs inventory Drive through encrypted server-side OAuth credentials, extract structural units into object storage and PostgreSQL, and reconcile permissions before query execution. Redis-compatible workers, signed webhooks, structured logs, and OpenTelemetry-compatible traces are deployment adapters, not hard requirements in the demo.

Every repository boundary receives a workspace ID and actor ID. Unknown or stale permission state fails closed. Find All traverses the eligible indexed corpus under a versioned matching policy; it never means unrelated files.

## Current limitation source

The earlier three-result limitation was a UI/default `pageSize` of 3 in `runSampleRetrieval`, not an exhaustive engine limit. The demo now defaults to 20 and proves pagination across 66 indexed synthetic records.
