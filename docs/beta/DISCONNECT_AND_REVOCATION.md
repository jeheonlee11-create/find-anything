# Google Drive disconnect and revocation

The workspace owner chooses **Disconnect Google Drive** and confirms deletion. The server rechecks workspace ownership, decrypts a refresh token when available (otherwise the access token), asks Google to revoke it, and only then deletes connector credentials and indexed workspace data.

Expected results:

- Google authorization is revoked.
- Encrypted access and refresh tokens are deleted.
- Indexed metadata and extracted searchable units for that connector are deleted.
- Searches fail closed with a disconnected-connector response.
- Reconnecting requires a new OAuth consent flow.

If Google does not confirm revocation, the endpoint returns a safe error and retains local data so the user can retry. Tokens, authorization headers, and private content must never appear in the response or ordinary logs.

Removing a single file or Drive permission is handled by the next complete inventory/revalidation: the stale file and extracted content are removed or hidden before search results are returned.
