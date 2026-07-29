# Google Drive disconnect and revocation

The workspace owner chooses **Disconnect Google Drive and delete data** in
`/settings`, or **Disconnect Google Drive** on the workspace dashboard, and
confirms. The server rechecks workspace membership and owner role, decrypts a
refresh token when available (otherwise the access token), asks Google to revoke
it, and only then deletes connector credentials and indexed workspace data.

Deleted once Google confirms revocation (`deleteConnectorData`):

- Encrypted access and refresh tokens, plus any pending OAuth state and refresh
  lease for the connector.
- Indexed file metadata, file versions, and extracted searchable text units.
- Search vectors, inferred file relationships, and detected conflicts.
- Retrieval traces and search receipts, including their stored query text and
  citations.
- Indexing jobs, retry attempts, continuations, failure records (including
  sanitized file names), and coverage receipts.
- Sync-run history for the connector.

Retained, because it is not connector output:

- The user record, the workspace, and its membership row.
- Developer API keys scoped to the workspace.
- Feedback the user submitted and privacy-safe aggregate analytics counters.

Every delete statement is workspace- or connector-scoped and bounded, so the
operation costs a fixed number of subrequests regardless of how many files were
indexed.

Other expected results:

- Google authorization is revoked.
- Searches fail closed with a disconnected-connector response.
- Reconnecting requires a new OAuth consent flow.

If Google does not confirm revocation, the endpoint returns a safe error and retains local data so the user can retry. Tokens, authorization headers, and private content must never appear in the response or ordinary logs.

Removing a single file or Drive permission is handled by the next complete inventory/revalidation: the stale file and extracted content are removed or hidden before search results are returned.
