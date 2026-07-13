# Manual production setup

The following owner actions are required before accepting real users.

1. Domain/DNS: add the Sites-provided records for `findanything.dev`; set app/API/docs/MCP public URL variables.
2. PostgreSQL: create production and test databases, TLS-required URLs, backups, and a least-privilege migration role.
3. Google Cloud: create a project; enable Google Drive API; configure the OAuth consent screen; add test users; create an OAuth 2.0 Web application client; add the exact hosted redirect `https://find-anything-agent-memory.minhwi-yi.chatgpt.site/api/connectors/google-drive/callback` for the current deployment and `https://app.findanything.dev/api/connectors/google-drive/callback` after the custom domain is active; declare `https://www.googleapis.com/auth/drive.readonly`; complete restricted-scope verification and any required security assessment before public use.
4. Secrets: generate a 32-byte `TOKEN_ENCRYPTION_KEY` (64 hexadecimal characters or base64url) and configure it with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the exact `GOOGLE_REDIRECT_URI` in Sites. Also generate session, CSRF, API-key pepper, receipt-signing, and webhook secrets before their later phases.
5. OpenAI: create a restricted project key and budgets only if embeddings/query understanding are enabled.
6. Stripe: create Free/Developer/Team products and prices; set checkout, portal, webhook endpoint, signing secret, test mode, and tax/legal settings.
7. Email: configure a verified sending domain, authentication/verification templates, support address, and privacy contact.
8. Storage/jobs: configure object storage and Redis-compatible workers if selected; define lifecycle and retry policies.
9. Monitoring: configure Sentry-compatible errors, logs, uptime, traces, alert ownership, and PII scrubbing.
10. Legal: counsel must approve Terms, Privacy Policy, DPA, subprocessors, acceptable-use, retention, and deletion policies.
11. Security: human architecture review, dependency/secret scan, authorization test, OAuth threat review, parser review, and penetration test.
