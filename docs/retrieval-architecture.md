# Retrieval architecture

The live path is `/api/workspaces/:workspaceId/search` and `/v1/search` → authenticated workspace authorization → D1 source files and structural units → literal candidates → deterministic Best Matches ranking or complete Find All ordering → exact citations → one durable trace → one durable receipt.

Structural units are Google Doc paragraphs, Slide elements and speaker notes, Sheet cells, and PDF text blocks. Each stores a source location and SHA-256 content hash. Coarse Drive export fallbacks remain labeled with only the location actually available.

Semantic indexing and query-time embeddings are paused. Active sync, product search, REST search, and MCP search make no OpenAI API calls. Existing dormant experimental code and schema are not part of the active retrieval path and must not be enabled until explicitly authorized.

Each Google-native extraction records `structured`, `fallback`, or `unsupported`. A fallback also stores a sanitized API/status reason such as `GOOGLE_DOCS_HTTP_403`; it never stores an access token or provider response body. A run records structured and fallback totals so live extraction claims can be audited.

Receipts store hashes of the retrieval configuration, index snapshot, and returned result set. Traces store the correlation ID, authorization/load/matching timing, candidate counts, permission decisions, exclusions, coverage, and exact returned evidence. These records are durable but neither immutable nor digitally signed.

Before browser, REST, MCP, citation, or relationship data is returned, the server requires workspace membership or a workspace-scoped API key, requires an active connector, refreshes an expired access token when possible, and completes a current Drive inventory. Indexed rows whose source IDs are absent from that inventory are ineligible. If the inventory or token refresh fails, retrieval fails closed with no partial results.

Manual sync is incremental and idempotent. It upserts connector/source pairs, reuses unchanged structured files, retries transient Google failures, re-extracts changed or prior-fallback files, and marks missing source IDs as deleted or no longer authorized while removing their extracted units. Each run records additions, updates, unchanged files, removals, pagination status, and structural/fallback totals.

Lineage is heuristic and explicitly inferred. Content hashes, token similarity, filenames, timestamps, version terms, and numeric differences create explainable, user-correctable relationships.
