# Five-minute quickstart

1. Sign in locally, create or open a workspace, and index Drive.
2. Create a workspace API key with `POST /api/workspaces/:workspaceId/api-keys`. Copy the returned secret once; never commit it.
3. Put the key in your shell as `FIND_ANYTHING_API_KEY`.
4. Search:

```bash
curl http://localhost:3000/v1/search \
  -H "Authorization: Bearer $FIND_ANYTHING_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: quickstart-1" \
  -d '{"query":"scholarship","mode":"best","fileType":"docs","pageSize":20}'
```

5. Use the returned `traceId` and `receiptId` with `/v1/retrieval-traces/:traceId` and `/v1/search-receipts/:receiptId`. See `examples/typescript-search.ts`, `examples/python-search.py`, `OPENAPI.yaml`, and `API.md`.
