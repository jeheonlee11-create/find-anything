# Manual production setup

The following owner actions are required before accepting real users.

1. Domain/DNS: add the Sites-provided records for `findanything.dev`; set app/API/docs/MCP public URL variables.
2. PostgreSQL: create production and test databases, TLS-required URLs, backups, and a least-privilege migration role.
3. Google Cloud local verification: create a project; enable Google Drive API; configure the OAuth consent screen; add test users; create an OAuth 2.0 Web application client; register exactly `http://localhost:3000/api/connectors/google-drive/callback`; declare `https://www.googleapis.com/auth/drive.readonly`; and set the same callback as `GOOGLE_REDIRECT_URI` in `.env.local`.
4. Local secrets: generate a 32-byte `TOKEN_ENCRYPTION_KEY` (64 hexadecimal characters or base64url) and place it with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`. Never commit or paste these values into documentation.
5. Production domain: publish the site, attach a hostname through Sites, add the returned DNS and validation records, and wait until the custom-domain and SSL statuses are active. Then register `https://<custom-domain>/api/connectors/google-drive/callback` in Google Cloud and configure that exact URI plus the production secrets in Sites.
5. OpenAI: create a restricted project key and budgets only if embeddings/query understanding are enabled.
6. Stripe: create Free/Developer/Team products and prices; set checkout, portal, webhook endpoint, signing secret, test mode, and tax/legal settings.
7. Email: configure a verified sending domain, authentication/verification templates, support address, and privacy contact.
8. Storage/jobs: configure object storage and Redis-compatible workers if selected; define lifecycle and retry policies.
9. Monitoring: configure Sentry-compatible errors, logs, uptime, traces, alert ownership, and PII scrubbing.
10. Legal: counsel must approve Terms, Privacy Policy, DPA, subprocessors, acceptable-use, retention, and deletion policies.
11. Security: human architecture review, dependency/secret scan, authorization test, OAuth threat review, parser review, and penetration test.
