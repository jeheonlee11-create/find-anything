# Find Anything developer API

The `/v1` API searches the same workspace-isolated Drive index used by the product UI. Send `Authorization: Bearer fa_live_…` and optionally `X-Request-ID`. Keys are scoped to one workspace, stored only as SHA-256 hashes, limited to 60 requests per minute, and returned in plaintext only when created.

- `POST /v1/search`
- `GET /v1/searches/:searchId`
- `GET /v1/searches/:searchId/results`
- `GET /v1/retrieval-traces/:traceId`
- `GET /v1/search-receipts/:receiptId`
- `GET /v1/workspaces/:workspaceId/coverage`
- `GET /v1/files/:fileId/citations`
- `GET|PATCH /v1/files/:fileId/relationships`
- `POST /api/mcp` — authenticated MCP JSON-RPC endpoint

Search is intentionally literal-only while paid semantic APIs are paused. `best` ranks matches by exact title, filename, MIME type, and extracted-content evidence; `all` returns every literal match in stable filename order. Filters are `all`, `docs`, `slides`, `sheets`, and `pdf`. Pagination uses opaque cursors, defaults to 20 results, and accepts at most 100.

Every successful search returns `X-Request-ID`, `searchId`, `traceId`, and `receiptId`. Receipts include configuration, index-snapshot, and result-set SHA-256 hashes for reproducibility. These hashes detect changed inputs; they are not digital signatures.

Exact citations include the source Drive URL, structural unit type and location, excerpt, content hash, and retrieval timestamp. Google-native files may temporarily report an export fallback until the Docs, Slides, and Sheets APIs are enabled.

Every live retrieval revalidates the connected account’s current Drive inventory before returning results. A disconnected connector, failed token refresh, incomplete permission inventory, or unverified source ID returns a fail-closed error instead of partial data. Search responses include extraction method, source, score breakdown, authorized files discovered/searched, pagination completion, last successful sync, incomplete reasons, and the trace ID.

Errors use `{ "error": { "code", "message", "requestId" } }`. Receipt and trace records are durable retrieval records; they are not described as immutable or cryptographically signed.

See `OPENAPI.yaml` for the REST contract and `MCP.md` for JSON-RPC setup and tool inputs.
