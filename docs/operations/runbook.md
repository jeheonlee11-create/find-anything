# Operations runbook

Replaces the earlier OPERATIONS, RUNBOOK, and INCIDENT_RESPONSE notes, which
described a PostgreSQL and billing stack this product does not have.

## Health

- `GET /api/health` runs `select 1` against D1: `ok` (200) or `degraded` (503).
- `GET /api/readiness` lists missing required configuration by name and reports
  enabled features (`literalSearch: true`, `semanticSearch: false`).
- `GET /api/internal/metrics` (bearer `INTERNAL_ADMIN_TOKEN`) returns nulls until
  an analytics provider is connected; it never invents numbers.

## Indexing

- One active job per connector. A job whose heartbeat is older than two minutes
  shows as delayed and can be resumed; a hop whose lease expired cannot commit.
- The admin page `/admin/beta` lists recent connectors and jobs, open failure
  categories, and coverage receipts.
- Retryable failures (Google 429/5xx, timeouts) are retried up to twice per file;
  permanent ones (permission denied, unsupported type, over the size cap) are
  settled and counted, not retried.

## Connector errors

- `reauthorization_required`: the grant was revoked or lacks the Drive scope.
  The user must reconnect. Search returns 409 with that reason.
- A transient Google error leaves the connector usable; the next request retries.
- `PERMISSION_REVALIDATION_FAILED` (503) means the query-time Drive listing
  failed. No results were returned, by design.

## Key rotation

1. Generate a new 32-byte `TOKEN_ENCRYPTION_KEY`; move the old value into
   `TOKEN_ENCRYPTION_KEY_PREVIOUS`.
2. Deploy. New values are sealed with the new key; old ones still open. Access
   tokens are re-sealed on their next refresh (about hourly), refresh tokens when
   Google rotates them or when a legacy `v1` value is refreshed.
3. Remove the old key only once no connector still holds a ciphertext with its
   key id (the second dot-separated field of each `v2` value).

`API_KEY_PEPPER` cannot rotate without reissuing API keys, because only HMACs
of the keys are stored.

## Incidents

- Severity 0, confirmed credential or customer-data exposure or cross-tenant
  access: disable the affected route, rotate `TOKEN_ENCRYPTION_KEY` and Google
  client credentials, preserve logs, and notify affected users.
- Severity 1, outage or uncertain permission enforcement: keep failing closed
  and communicate status; do not add a bypass to restore results.
- Record a timeline, scope, containment, and follow-ups. Never paste customer
  content or secrets into tickets or chat.

## Disconnect and deletion

See [docs/beta/DISCONNECT_AND_REVOCATION.md](../beta/DISCONNECT_AND_REVOCATION.md)
and [docs/beta/DATA_DELETION.md](../beta/DATA_DELETION.md). Deletion runs only
after Google confirms revocation, in one D1 transaction.
