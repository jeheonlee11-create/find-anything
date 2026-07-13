# Google Drive MVP technical plan

The Phase 1 server implementation now exists, but the connector is not live until the manual Google Cloud and hosted-secret setup below is completed and an end-to-end sync succeeds.

1. **OAuth flow** — create a Google Cloud OAuth application, use Authorization Code with PKCE, verify `state`, and exchange the code server-side.
2. **Scopes** — begin with `drive.file` and Google Picker for selected folders or files. Evaluate `drive.readonly` only if whole-Drive discovery is essential; broad scopes require Google verification and may require a security assessment.
3. **Workspace connection** — bind every refresh token to one workspace, actor, connector, granted-scope set, and credential version.
4. **File listing** — traverse selected folders and shared drives with complete Drive API pagination. Persist source IDs, MIME types, parents, owners, timestamps, and checksums.
5. **Export or download** — export native Docs, Slides, and Sheets through Google Workspace APIs; download binary PDFs and supported Office files.
6. **Google Docs extraction** — preserve heading paths, paragraph indices, tables, footnotes, and comment anchors where APIs expose them.
7. **Google Slides extraction** — preserve slide numbers, object IDs, titles, body text, speaker notes, tables, chart labels, and image alt text.
8. **PDF extraction** — preserve pages, blocks, tables, captions, bounding boxes, and OCR confidence.
9. **Indexing** — store structural units and checksums before adding keyword and vector representations. Index state must be explicit.
10. **Permission snapshots** — store source permission version, actor, allow, deny, or unknown decision, reason, and capture time without leaking denied metadata.
11. **Synchronization** — use Drive changes tokens plus scheduled full reconciliation. Record sync cursors and connector coverage.
12. **Incremental updates** — compare source version IDs and checksums; replace only changed file versions and extracted units.
13. **Revoked access** — process permission changes promptly, invalidate affected units, and deny retrieval while state is uncertain.
14. **Query-time verification** — resolve actor identity and verify current access before a candidate can become returned evidence.
15. **Failures and retries** — use idempotent jobs, bounded exponential backoff, dead-letter states, visible indexing failures, and operator retry controls.

## Implemented now

- Authenticated connect and callback routes
- Authorization Code flow with state and PKCE
- AES-GCM encryption for OAuth credentials
- D1/Drizzle migrations for users, workspaces, memberships, connectors, OAuth state, source files, versions, structural units, and sync runs
- Complete `files.list` pagination with explicit metadata, owners, permissions, parents, links, checksums, size, and modified time
- Native Google Docs and Slides plain-text export, Sheets first-sheet CSV export, and serverless PDF page extraction
- Access-token refresh and encrypted refresh-token storage
- File-level indexing status, extraction failure tracking, and sync-run totals

Not implemented in this phase: query-time permission verification, real retrieval over the durable index, exact Docs/Slides/Sheets structure, incremental Drive changes, background workers, receipts, REST production search, or MCP.

## Required credentials and manual Google setup

See `.env.example`. Real secrets must be configured in the hosting environment and never committed.

## Production dependencies still required

- A Sites D1 `DB` binding and applied migration
- hosted `TOKEN_ENCRYPTION_KEY` secret (32-byte hex or base64url)
- Google OAuth consent and verification
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and exact `GOOGLE_REDIRECT_URI`
- restricted-scope verification/security assessment as required for `drive.readonly`
- background-job runner before large production Drives
- keyword index and pgvector-compatible adapter for later phases
- connector reconciliation and Drive changes processing
- security review, abuse prevention, audit retention, and operational monitoring
