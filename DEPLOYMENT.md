# Deployment

The demo deploys through OpenAI Sites using the vinext Cloudflare Worker build. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, then publish a saved Sites version.

Production requires PostgreSQL, encrypted secrets, object storage, a job backend, email, Google OAuth, Stripe, monitoring, backups, and a tested rollback. Apply schema migrations before application rollout; retain the previous Sites version for rollback. Never point OAuth or billing webhooks at a preview deployment.

## Week 1 Sites deployment checklist

1. Verify `.openai/hosting.json` declares the logical D1 binding `DB`.
2. Confirm `drizzle/0000_daily_zombie.sql` is packaged and applied.
3. Set Google client ID, client secret, exact redirect URI, and token-encryption key as Sites runtime secrets.
4. Register the exact deployed callback in Google Cloud before deploying.
5. Deploy, sign in as a Google OAuth test user, create two workspaces, connect one, sync, verify isolation, refresh an expired token, disconnect, and confirm indexed data removal.
6. Keep the product private/test-user-only until Google restricted-scope requirements and the security review are complete.
