# Workspace Coverage Map

Coverage snapshots use `workspace-coverage-v1` and are calculated only from the connected inventory Find Anything can observe. They never infer unknown connectors or unseen files.

## Formulas

- **Known-source coverage** = stored current inventory rows / currently authorized files discovered.
- **Indexing success** = successfully indexed files / terminal supported files (`indexed + failed`). Pending files are shown separately.
- **Searchable coverage** = files with committed searchable content / eligible supported files (`indexed + failed + pending`).
- **Permission accessibility** = currently authorized files / (`currently authorized + previously known removed-or-no-longer-authorized`). Google Drive does not always reveal whether a missing item was deleted or its permission was revoked, so the combined label is intentional.

Freshness is `fresh` through 24 hours, `aging` through seven days, `stale` after seven days, and `unknown` before a successful sync. A snapshot is partial when pagination is incomplete, records are missing, files are pending/failed/unsupported, previously known files are unavailable, or freshness is stale.

## Surfaces

- Browser: `GET /api/workspaces/:workspaceId/coverage` (authenticated workspace member).
- Developer API: `GET /v1/workspaces/:workspaceId/coverage` (workspace-scoped API key).
- MCP: `get_search_coverage` uses the same developer endpoint and authorization boundary.
- Search responses: `coverage.snapshot`.
- Traces: the versioned snapshot is stored inside `coverage`, with `coverageSnapshotVersion` exposed separately.
- Receipts: `coverageSnapshot`, or `null` for older receipts.

The workspace page shows a compact status and five top-line measures; formulas, counts, incomplete reasons, freshness, and limitations are behind an expandable disclosure.
