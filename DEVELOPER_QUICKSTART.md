# Five-minute developer evaluation

The hosted demo needs no private files. Open `/app`, then run Find All for `air pollution Detroit`. Page through more than 20 results, filter to Google Docs, inspect an exact citation, open Coverage and Trace, and export the retrieval record.

API example:

```bash
curl https://find-anything.dev/api/retrieval/find-all \
  -H 'Content-Type: application/json' \
  -d '{"query":"air pollution Detroit","page":1,"pageSize":20,"filters":{"fileType":"document"}}'
```

The hosted endpoint uses synthetic data and no API key. Production keys, webhooks, TypeScript/Python SDK packages, and MCP are contracts only until authentication and persistence exist. See `API.md`, `OPENAPI.yaml`, and `/docs` for pagination, citations, traces, receipts, errors, and permission boundaries.
