# Google Drive MVP technical plan

This document is an implementation plan. The connector is not live.

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

## Required credentials

See `.env.example`. Real secrets must be configured in the hosting environment and never committed.

## Production dependencies still required

- PostgreSQL-compatible persistence and migrations
- encrypted connector credential store
- background-job runner
- Google OAuth consent and verification
- keyword index and pgvector-compatible adapter
- connector reconciliation and Drive changes processing
- security review, abuse prevention, audit retention, and operational monitoring

