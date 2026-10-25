# Threat model

Protected assets: OAuth tokens, workspace membership, which Drive files a user
has shared, file metadata, extracted text, API keys, search traces, and
receipts.

| Threat | Control in the code |
|---|---|
| Cross-tenant reads (IDOR) | Every route derives the actor server-side and checks workspace membership or a workspace-scoped API key before loading data (`lib/auth/`, `lib/api/auth.ts`); a mismatched `workspaceId` is refused |
| Stale Drive permissions | Every search re-lists the connected account's Drive files and drops stored rows that are no longer in it; any failure returns no results (`lib/google-drive/permission.ts`, `lib/workspace-search/search-index.ts`) |
| OAuth state replay or substitution | State stored as a hash, consumed once with `DELETE ... RETURNING`, bound to the actor, 10-minute expiry; PKCE S256 (`lib/google-drive/oauth-state.ts`, `connect-flow.ts`) |
| Token theft from the database | AES-256-GCM with a key id and AAD binding each ciphertext to its row and field; key rotation through `TOKEN_ENCRYPTION_KEY_PREVIOUS` (`lib/security/secret-box.ts`) |
| API-key theft from the database | Only an HMAC of each key is stored, under a pepper or an HKDF-derived key (`lib/api/key-hash.ts`) |
| Timing attacks on shared secrets | Bearer tokens compared in constant time (`lib/security/constant-time.ts`); service requests use HMAC signatures (`lib/indexing/queue-protocol.ts`) |
| Oversized or hostile files | Byte caps on every export and download, memory-weighted extraction pool, local parsers only (`lib/google-drive/client.ts`, `sync.ts`) |
| Malformed MCP or API input | Tool arguments validated against their schemas before running (`lib/mcp/tools.ts`); request bodies type-checked per route |
| Brute-force API use | 60 requests per minute per API key; per-actor search limits |
| Leaking files through traces | Denied files are counted, never named; analytics reject fields that look like queries, filenames, content, or tokens |
| Indirect prompt injection | Extracted text is returned as data with citations; no model reads it on the search path |

Not done: an external security review or penetration test, a content security
policy audit, and formal retention enforcement beyond disconnect-and-delete.
