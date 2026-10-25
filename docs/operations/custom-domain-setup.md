# Custom domain setup for Cloudflare Sites

The repository deploys through OpenAI Sites with a Cloudflare Worker-compatible vinext build, as declared in `.openai/hosting.json` and `vite.config.ts`.

1. Purchase or use a domain you control, such as `findanything.dev`.
2. In the deployed Sites project, choose **Custom domain** and add the hostname.
3. Copy the exact DNS records Sites provides. Subdomains normally use the provided CNAME target; an apex domain uses the provided A and validation records.
4. Add those records at the DNS provider or registrar. Do not invent targets from this document.
5. Wait for domain and TLS validation to become active.
6. Set `NEXT_PUBLIC_SITE_URL` in the hosted environment. That single value is the source of truth: the public pages are served from `/` and the product from `/app` on the same origin, and the Google OAuth redirect URI derives from it. Leave `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOCS_URL`, and `NEXT_PUBLIC_MCP_URL` unset unless a surface genuinely moves to its own hostname.
7. Rebuild and redeploy so metadata, documentation, and the derived callback use the selected domain.
8. Keep the generated Sites URL available for diagnostics. Redirect it only when Sites supports a safe canonical redirect.

DNS and registrar access are manual requirements; this repository cannot purchase a domain or change registrar records.

`findanything.dev` is currently served by a separate Cloudflare Pages project built from `marketing-site/`, so moving it to this application is a release-and-reattach operation, not an additive one. The precise sequence, verification steps, and rollback are in [CUSTOM_DOMAIN_CUTOVER.md](CUSTOM_DOMAIN_CUTOVER.md). Google Cloud Console steps are in [FOUNDER_GOOGLE_CONSOLE_ACTIONS.md](FOUNDER_GOOGLE_CONSOLE_ACTIONS.md).

