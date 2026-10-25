# Custom-domain cutover and rollback

**Nothing in this plan has been performed.** No DNS record was changed, no domain
was attached or released, and no deployment was made. Every step below requires a
human in the Cloudflare dashboard, the Sites dashboard, and the Google Cloud
Console.

## Current state

- `findanything.dev` is currently served by a **separate Cloudflare Pages
  project**, created by Direct Upload from `marketing-site/` (static HTML plus
  `_worker.js`, which proxies the access-request form to the application's real
  waitlist API). Confirm the project's exact name in the Cloudflare dashboard
  under Workers & Pages before touching anything; the repository does not record
  it.
- The unified application — public pages at `/` and the authenticated product at
  `/app` — is the Sites project declared in `.openai/hosting.json`
  (`appgprj_6a51f917e4748191943e15ab5b14530a`). It is reachable today only at its
  generated Sites address.
- Because one hostname can be attached to only one project, the cutover means
  **releasing `findanything.dev` from the Pages project and attaching it to the
  Sites project**. It is not an additive change, and there is a gap between the
  two operations.
- `marketing-site/` must stay deployed and unmodified until this cutover is
  explicitly approved. It is the rollback target.

## Pre-cutover checklist

1. On the Sites project, verify at its generated address: `/` renders, `/privacy`
   and `/terms` render, `/connect` redirects an anonymous visitor to sign-in,
   `/beta/access-required` renders and its form returns a server-confirmed
   success, `/app` requires sign-in, and `GET /api/readiness` returns `ready:true`.
2. Set `NEXT_PUBLIC_SITE_URL=https://findanything.dev` in the Sites project's
   hosted environment. Leave `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`,
   `NEXT_PUBLIC_DOCS_URL`, and `NEXT_PUBLIC_MCP_URL` unset — they default to the
   site origin.
3. Set the Google connector secrets on the Sites project: `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`. Leave `GOOGLE_REDIRECT_URI`
   unset so it derives as
   `https://findanything.dev/api/connectors/google-drive/callback`, or set it to
   exactly that value.
4. In the Google Cloud Console, **add** (do not replace) the authorized origin
   `https://findanything.dev` and the redirect URI
   `https://findanything.dev/api/connectors/google-drive/callback` to the existing
   OAuth client. Keep the old entries during the transition. See
   [FOUNDER_GOOGLE_CONSOLE_ACTIONS.md](FOUNDER_GOOGLE_CONSOLE_ACTIONS.md).
5. Export the DNS records for `findanything.dev` exactly as they stand now, and
   save the Pages project's current deployment ID. These are what a rollback
   restores.
6. Back up D1 before the window. The cutover itself changes no data, but the
   backup bounds the blast radius of anything discovered afterwards.
7. Announce a maintenance window to beta testers. Pick a low-traffic window: DNS
   and TLS validation are not instantaneous.

## Cutover

8. In the Cloudflare Pages project that currently serves the domain, remove the
   `findanything.dev` custom domain (and `www` if it is attached there).
9. In the Sites project, add `findanything.dev` as a custom domain. Copy the exact
   records Sites returns — apex domains use the provided A/AAAA and validation
   records; a subdomain uses the provided CNAME target. Do not invent targets from
   this document.
10. Add those records at the DNS provider. Delete only records the Pages project
    required and Sites does not.
11. Wait until Sites reports the domain **and** the TLS certificate active. Do not
    proceed while either is pending.
12. Redeploy the Sites project so `NEXT_PUBLIC_SITE_URL` is baked into metadata,
    canonical URLs, and the derived OAuth redirect URI.

## Post-cutover verification

13. `https://findanything.dev/` renders the unified homepage over valid TLS.
14. `/privacy`, `/terms`, `/trust`, and `/beta/access-required` render; the
    access-request form still returns a server-confirmed success.
15. `/connect` redirects an anonymous visitor to `/signin-with-chatgpt` with
    `return_to=%2Fconnect`; an approved tester completes Drive consent and lands
    in their workspace.
16. An unapproved signed-in account lands on `/beta/access-required` and no Google
    consent screen appears.
17. `GET /api/readiness` returns `ready:true` and
    `googleRedirectUriSource` reflects the intended source.
18. Existing testers' Drive connections still work — refresh, index, search,
    trace, receipt, and disconnect. Already-issued refresh tokens remain valid
    because the OAuth client was not replaced.
19. Second-account isolation: a second signed-in account cannot see the first
    account's workspace or files.
20. Only after all of the above pass: remove the superseded Google authorized
    origin and redirect URI, and archive the Pages project (do not delete it until
    a full release cycle has passed).

## Rollback

Trigger a rollback if the domain or TLS does not go active, if sign-in or Drive
consent fails, or if any verification step above fails.

1. In the Sites project, remove the `findanything.dev` custom domain.
2. In the Cloudflare Pages project, re-add `findanything.dev` as a custom domain.
3. Restore the DNS records exported in step 5 exactly.
4. Confirm the marketing site is serving again over valid TLS, and that its
   access-request form still saves through `_worker.js`.
5. Leave the Google Cloud entries in place. They are additive and harmless, and
   removing them would break a later retry.
6. Revert `NEXT_PUBLIC_SITE_URL` on the Sites project to unset (or back to the
   generated Sites address) so its metadata stops advertising a domain it no
   longer serves.
7. Record what failed before retrying. Do not retry inside the same window.

Rollback restores availability, not history: any Drive authorization completed
against `https://findanything.dev` during the window stays valid, because tokens
are bound to the OAuth client, not to the hostname that started the flow.

## Notes

- DNS and registrar access are manual. This repository cannot purchase a domain,
  change registrar records, attach a domain, or deploy.
- Keep the generated Sites address working for diagnostics throughout.
- Only the hostnames named in this plan are in scope. Any other subdomain of the
  registrable domain belongs to a separate, unrelated deployment: do not
  repoint, release, reattach, or otherwise modify it.
