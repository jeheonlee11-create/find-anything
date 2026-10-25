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

- `NEXT_PUBLIC_SITE_URL` — the single source of truth. The product is served at
  `/app` on this same origin, and the Google redirect URI derives from it.
- `GOOGLE_REDIRECT_URI` — optional. Only set it to override the derived value.
- Google Cloud authorized JavaScript origin and redirect-URI entries

### Configure after rotating Google credentials

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### Optional

- `SUPPORT_EMAIL`
- `PRIVACY_EMAIL`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`, and `NEXT_PUBLIC_MCP_URL` — each defaults to `NEXT_PUBLIC_SITE_URL`; set one only if that surface genuinely moves to its own hostname
- `APP_VERSION` for feedback and diagnostic attribution

### Legacy and removable

- `POSTHOG_HOST` and `POSTHOG_API_KEY`: first-party D1 analytics is now authoritative.
- `DEMO_ACCESS_TOKEN`: remove unless the separate investor-demo endpoint is intentionally retained.
- `SESSION_SECRET` and `CSRF_SECRET`: not used because Sites owns ChatGPT sign-in sessions and OAuth uses server-stored state plus PKCE.

## Google Cloud requirements

Enable Google Drive API, Google Docs API, Google Sheets API, and Google Slides API in the same Google Cloud project as the OAuth client. Keep the localhost redirect registered during migration:

`http://localhost:3000/api/connectors/google-drive/callback`

After the domain is active, add (the site and the product share one origin, so
there is no separate app hostname):

- Authorized origin: `https://findanything.dev`
- Authorized redirect: `https://findanything.dev/api/connectors/google-drive/callback`

The consent screen must identify Find Anything, list accurate privacy/support contacts, declare the `drive.file` scope, and include each private-beta Google account as a test user while the app remains in testing mode. Google has not verified or approved the application; restricted-scope verification is pending. The full founder-only checklist is in [Google Cloud Console actions](../operations/google-console-actions.md).

## Post-purchase sequence

`findanything.dev` is currently served by a separate Cloudflare Pages project
built from `marketing-site/`, so this is a release-and-reattach operation. The
precise, ordered sequence with verification and rollback lives in
[custom-domain cutover](../operations/custom-domain-cutover.md). In outline:

1. Release `findanything.dev` from the Pages project, then attach it to the existing Sites project—do not create a new project.
2. Add the exact records returned by Sites.
3. Wait until Sites reports the domain and TLS certificate active.
4. Set `NEXT_PUBLIC_SITE_URL`; leave the other public URL overrides unset.
5. Add the custom origin and callback in Google Cloud while keeping localhost temporarily.
6. Set the Google client ID and secret as hosted secrets.
7. Redeploy the existing project privately.
8. Verify readiness, sign-in, the `/connect` journey for approved and unapproved accounts, OAuth, Docs/Sheets/Slides indexing, literal search, traces, receipts, disconnect, second-user isolation, permission removal, deleted-file cleanup, and revoked-token fail-closed behavior.
