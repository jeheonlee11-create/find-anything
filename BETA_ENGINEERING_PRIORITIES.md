# Public-beta engineering priorities

Ranked by security impact, user value, and dependency order after auditing the current repository.

1. **Establish a fail-closed identity and authorization boundary.** Protect the application, workspace APIs, and connector mutations; derive actor identity only from the trusted Sites boundary; prevent arbitrary workspace-ID access. **Implemented in this change for the current synthetic workspace.**
2. Add persistent users, workspaces, memberships, owner/member roles, sessions, deletion, and tenant-isolation migrations/tests.
3. Implement verified Google OAuth with state/PKCE, encrypted refresh tokens, revocation, and least-privilege scopes.
4. Build durable Drive inventory, extraction, incremental sync, deletion/permission reconciliation, retries, and job observability.
5. Replace synthetic retrieval with workspace-scoped PostgreSQL full-text search, structural units, coverage accounting, cursor pagination, and query-time ACL checks.
6. Add scoped, hashed, rotatable API keys, rate limits, idempotency, MCP authentication, and auditable usage metering.
7. Complete end-to-end account/workspace/source deletion, retention enforcement, backups, and restore testing.
8. Configure production monitoring, alerting, external uptime, incident ownership, secure logging, and privacy-safe analytics.
9. Complete billing test mode, signed webhooks, plan enforcement, grace periods, support email, and verified onboarding flows.
10. Resolve dependency findings and complete human security, privacy/legal, parser, OAuth, tenant-isolation, and penetration reviews.

## Task #1 acceptance criteria

- `/app` redirects anonymous visitors to the hosted sign-in flow.
- Connector mutation routes return 401 before reporting implementation state.
- Workspace APIs return 401 anonymously and 404 for unauthorized workspace IDs.
- The response never exposes another workspace’s existence or caller email.
- Authorized demo responses contain a stable pseudonymous actor ID, never the email.
- Authentication and authorization behavior is covered by automated tests.

The current boundary authorizes only `ws_synthetic_demo`. Persistent membership is intentionally left for Task #2.
