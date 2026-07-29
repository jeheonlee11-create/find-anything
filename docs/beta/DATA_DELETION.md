# Data deletion procedure

## User-requested deletion

1. Verify the requester through the authenticated Find Anything account. Never accept a workspace ID alone as proof of identity.
2. Disconnect every Google Drive connector first. The disconnect operation attempts Google token revocation and, only on confirmation, deletes connector credentials, pending OAuth state, source-file metadata, file versions, extracted units, search vectors, inferred relationships, detected conflicts, retrieval traces, search receipts, indexing jobs and their attempts, continuations, failure records, coverage receipts, and sync runs. It does **not** delete workspace-scoped API keys, submitted feedback, or the workspace itself — those are separate steps below.
3. Revoke and delete workspace-scoped developer API keys.
4. Delete privacy-safe analytics associated with the user actor ID using the server-side deletion operation. Do not log the email, token, queries, or evidence excerpts while doing so.
5. Delete feedback unless retention is required for a documented security or legal reason. If retained, remove actor and workspace linkage.
6. Delete memberships, user-owned workspaces, and the user record in a transaction or controlled batch.
7. Record only a minimal deletion-completed audit record with a pseudonymous request ID and timestamp.
8. Confirm completion to the requester without returning deleted content or internal identifiers.

## Operational safety

- Back up D1 before any bulk deletion.
- Test the deletion query against counts before executing it.
- Never reset the whole database to fulfill one request.
- If Google revocation fails, stop before local connector deletion and retry; this preserves the ability to revoke safely.
- Default beta analytics retention: 90 days. Aggregate, non-identifying metrics may be retained longer.
