# Developer API and MCP server

Both run the same permission-checked search as the product UI
(`lib/workspace-search/run-search.ts`). [openapi.yaml](openapi.yaml) describes
the search, trace, receipt, coverage, and file endpoints; the diff and conflict
endpoints are documented only here.

## Authentication

Send `Authorization: Bearer fa_live_...`. A key belongs to one workspace and is
created by the workspace owner with `POST /api/workspaces/:workspaceId/api-keys`;
the secret is shown once, and only its HMAC-SHA256 is stored
(`lib/api/key-hash.ts`). Each key is limited to 60 requests per minute. Send an
optional `X-Request-ID`; responses echo it.

## REST endpoints (`/v1`)

| Method and path | Returns |
|---|---|
| `POST /v1/search` | Ranked or exhaustive matches with citations, coverage, confidence, `searchId`, `traceId`, `receiptId` |
| `GET /v1/searches/:searchId` | The search's receipt |
| `GET /v1/searches/:searchId/results` | Stored results, cursor-paginated |
| `GET /v1/retrieval-traces/:traceId` | The trace: stages, timings, bounded decisions, decision summary, replay events |
| `GET /v1/search-receipts/:receiptId` | The receipt: counts, citations, configuration/index/result hashes |
| `POST /v1/retrieval-diffs` | A deterministic comparison of two stored traces |
| `GET /v1/workspaces/:workspaceId/coverage` | What is indexed, pending, failed, unsupported, and unauthorized |
| `GET`, `PATCH /v1/workspaces/:workspaceId/conflicts` | Deterministic conflicts; record a review decision |
| `GET /v1/files/:fileId/citations` | Every stored unit of one authorized file |
| `GET`, `PATCH /v1/files/:fileId/relationships` | Inferred file relationships; correct one |

Search body: `query` (required, at most 500 characters), `mode` (`best` or
`all`), `fileType` (`all`, `docs`, `slides`, `sheets`, `pdf`), `cursor`, and
`pageSize` (default 20, at most 100). Matching is literal and whole-word;
semantic search is not built.

Every request that returns workspace data first re-lists the connected
account's Drive files. If that fails, the response is an error
(`PERMISSION_REVALIDATION_FAILED`, 503), never partial data. Errors use
`{ "error": { "code", "message", "requestId" } }`.

Receipt hashes detect changed inputs; they are not signatures, and traces and
receipts are durable records, not immutable ones.

```bash
curl https://findanything.dev/v1/search \
  -H "Authorization: Bearer $FIND_ANYTHING_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"renewal deadline","mode":"best","fileType":"docs"}'
```

Client examples: `examples/typescript-search.ts`, `examples/python-search.py`.

## MCP server

`POST /api/mcp` speaks JSON-RPC 2.0 (protocol version `2025-03-26`) with the
same API key:

```json
{
  "mcpServers": {
    "find-anything": {
      "url": "https://findanything.dev/api/mcp",
      "headers": { "Authorization": "Bearer ${FIND_ANYTHING_API_KEY}" }
    }
  }
}
```

Tools (`lib/mcp/tools.ts`): `search_files`, `find_all_files`,
`get_exact_evidence`, `get_search_coverage`, `get_retrieval_trace`,
`compare_retrievals`, `get_search_receipt`, `get_file_relationships`,
`get_workspace_conflicts`, `review_conflict`.

Arguments are validated against each tool's advertised input schema before the
tool runs; unknown, missing, mistyped, or out-of-range arguments return
`-32602 Invalid params` with a list of problems. A `workspaceId` that differs
from the key's workspace returns `-32003 WORKSPACE_FORBIDDEN`. Tools call the
same in-process handlers as the `/v1` routes (`lib/api/v1-handlers.ts`), and
results carry both text `content` and `structuredContent`.
