# Domain-purchase readiness

## Environment-variable classification

### Configure now

- `TOKEN_ENCRYPTION_KEY` — secret, exact 32-byte key format required by the connector crypto module.
- `API_KEY_PEPPER` — secret used to hash developer API keys.
- `BETA_ACCESS_MODE` — set to `invited` for private beta.
- `BETA_INVITE_PEPPER` — secret used to hash invitation emails.
- `BETA_ADMIN_EMAILS` — server-only comma-separated administrator allowlist.
- `INTERNAL_ADMIN_TOKEN` — secret only if the legacy founder metrics endpoint remains enabled.

### Requires the custom domain

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_REDIRECT_URI`
- Google Cloud authorized JavaScript origin and redirect-URI entries

### Configure after rotating Google credentials

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Optional

- `SUPPORT_EMAIL`
- `PRIVACY_EMAIL`
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`, and `NEXT_PUBLIC_MCP_URL` when separate subdomains exist
- `APP_VERSION` for feedback and diagnostic attribution

### Legacy and removable

- `POSTHOG_HOST` and `POSTHOG_API_KEY`: first-party D1 analytics is now authoritative.
- `DEMO_ACCESS_TOKEN`: remove unless the separate investor-demo endpoint is intentionally retained.
- `SESSION_SECRET` and `CSRF_SECRET`: not used because Sites owns ChatGPT sign-in sessions and OAuth uses server-stored state plus PKCE.

## Google Cloud requirements

Enable Google Drive API, Google Docs API, Google Sheets API, and Google Slides API in the same Google Cloud project as the OAuth client. Keep the localhost redirect registered during migration:

`http://localhost:3000/api/connectors/google-drive/callback`

After the domain is active, add:

- Authorized origin: `https://app.findanything.dev`
- Authorized redirect: `https://app.findanything.dev/api/connectors/google-drive/callback`

The consent screen must identify Find Anything, list accurate privacy/support contacts, declare the read-only scopes, and include each private-beta Google account as a test user while the app remains in testing mode.

## Post-purchase sequence

1. Attach `app.findanything.dev` to the existing Sites project—do not create a new project.
2. Add the exact CNAME and validation records returned by Sites.
3. Wait until Sites reports the domain and TLS certificate active.
4. Update the three domain-dependent environment values.
5. Add the custom origin and callback in Google Cloud while keeping localhost temporarily.
6. Set the rotated Google client ID and secret as hosted secrets.
7. Redeploy the existing project privately.
8. Verify readiness, sign-in, OAuth, Docs/Sheets/Slides indexing, literal search, traces, receipts, disconnect, second-user isolation, permission removal, deleted-file cleanup, and revoked-token fail-closed behavior.
