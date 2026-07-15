# Find Anything MCP endpoint

The local MCP endpoint is `POST http://localhost:3000/api/mcp`. It uses JSON-RPC 2.0 over HTTP and the same workspace-scoped bearer API key as `/v1`. Never put the key in a URL.

## Client configuration

```json
{
  "mcpServers": {
    "find-anything": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${FIND_ANYTHING_API_KEY}" }
    }
  }
}
```

Call `initialize`, then `tools/list`, then `tools/call`. The server advertises protocol version `2025-03-26`.

## Tools

- `search_files`: `query` required; optional `fileType`, `cursor`, and `pageSize`. Literal Best Matches only.
- `find_all_files`: same input; returns all literal matches with cursor pagination.
- `get_exact_evidence`: requires `fileId`.
- `get_search_coverage`: no input; uses the API key workspace.
- `get_retrieval_trace`: requires `traceId`.
- `get_search_receipt`: requires `receiptId`.
- `get_file_relationships`: requires `fileId`.

Supplying a `workspaceId` that differs from the key scope fails with `WORKSPACE_FORBIDDEN`. Tool results include both MCP text content and `structuredContent`. Search remains literal-only and uses no paid API.
