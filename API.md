# API

All production endpoints will require `Authorization: Bearer fa_…`, a request ID, workspace authorization, and rate limiting. The current retrieval endpoints operate only on synthetic demo data.

- `POST /api/retrieval/search` — ranked or exact demo retrieval.
- `POST /api/retrieval/find-all` — complete traversal of eligible demo records with page/pageSize compatibility.
- `GET /api/retrieval/traces/:traceId` — generated demo trace, not durable.
- `GET /api/retrieval/receipts/:receiptId` — generated exportable record, not immutable.
- `GET /api/workspaces/:workspaceId/coverage` — demo coverage.
- `GET /api/health` and `GET /api/readiness` — actual process/demo readiness.
- Google connector mutation routes return `501` until OAuth is configured.

Production cursor format, idempotency, structured errors, API-key scopes, webhook signing, and stable request IDs are specified in `OPENAPI.yaml` but require persistence.
