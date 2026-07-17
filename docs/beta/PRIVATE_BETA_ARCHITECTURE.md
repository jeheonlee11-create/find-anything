# Find Anything private-beta architecture

## Authentication and authorization

Sites authenticates the browser user and forwards the authenticated email. The app derives a pseudonymous actor ID, enforces invite-only beta access, then resolves every user-owned resource through `memberships`. Authentication never implies workspace authorization.

Protected code uses the central authorization helpers for workspaces, owners, connectors, runs, indexed files, receipts, and traces. A guessed resource ID returns the same safe 404 response as a missing resource. API keys are scoped to one workspace.

## Google OAuth lifecycle

Google OAuth uses state, PKCE, an exact configured redirect URI, and the read-only Drive scope. Access and refresh tokens are encrypted before D1 storage and never returned to the browser. Tokens refresh server-side before expiry. Concurrent requests in one worker share a single refresh operation. A rotated refresh token replaces the old encrypted value; when Google omits a refresh token, the existing encrypted value is preserved.

`invalid_grant` and missing refresh tokens move the connector to `reauthorization_required`. Indexed data is preserved, but live permission-aware search fails closed until the user reconnects. Disconnect explicitly revokes Google access and deletes connector credentials and indexed data.

## Indexing jobs and checkpointing

`Index now` creates or resumes one active job per connector. The browser receives only the job ID; the private continuation token is removed by the Worker before the response is returned. Each bounded attempt claims the job, records a heartbeat, runs a checkpointed Drive batch, records counters, and either schedules another attempt or reaches a terminal state.

Jobs use `queued`, `running`, `pausing`, `partial`, `completed`, `failed`, `cancelled`, `stale`, and `reauthorization_required`. Attempts and coverage receipts are immutable operational evidence. Existing source rows and extracted units remain connector-scoped, which prevents identical Google file IDs in different connectors from colliding.

The production Sites dispatch path for recursive background continuation must still be verified after deployment. Until that live test passes, the durable schema and processor are implemented but unattended continuation is a release blocker.

The new worker chain is guarded by `ENABLE_DURABLE_INDEXING_JOBS=true`. Leave it unset during migration deployment. Enable it only after the two-account staging test proves that Sites permits authenticated internal continuation after the initiating browser closes.

## Inventory reconciliation

Every Drive sync performs a complete paginated inventory check. Unchanged files are skipped by provider file ID and modified time. New and changed files are processed. Missing or no-longer-authorized files are tombstoned, marked unauthorized, and have extracted units removed immediately. Renames, moves, MIME changes, source links, ownership, and permission metadata are refreshed on upsert.

Future provider revision and permission fingerprints are nullable because historical rows cannot be reconstructed reliably. The migration backfills existing indexed, non-trashed rows as searchable and existing trashed rows as unauthorized without deleting production data.

## Search authorization and visibility

Search first checks workspace membership and connector state, then refreshes the live authorized Drive inventory. Only current, non-trashed source IDs with `searchable_status = searchable` are loaded. A file becomes searchable only after its extracted units are fully stored. Results preserve exact evidence, structural locations, content hashes, source links, traces, and receipts.

Literal ordering is deterministic. Semantic search remains paused.

## Failure categories

Failures are classified as permission denied, unsupported MIME type, export unsupported, too large, malformed/parser error, rate limit, provider timeout, temporary network error, expired token, reauthorization required, database error, or unknown. Each record contains a safe explanation and retryability flag. Stack traces, tokens, and document content are excluded.

Unsupported formats are coverage exclusions, not unexpected system failures.

## Coverage definitions

- Inventory coverage: processed current inventory records divided by authorized records discovered.
- Processing coverage: terminal processing outcomes divided by authorized records discovered.
- Searchable coverage: files with committed searchable content divided by eligible supported files.
- Content extraction coverage: indexed supported files divided by eligible supported files.
- Failure rate: failed supported files divided by eligible supported files.
- Unsupported rate: unsupported files divided by all authorized files discovered.
- Freshness: seconds since the connector's last successful verification.

Coverage receipts store the job, run, connector, workspace, terminal status, outcome counts, extraction/index versions, deployment version, and timestamps.

## Incident recovery

1. Do not reset D1 or delete indexed data.
2. Inspect connector status, latest job heartbeat, attempts, failure categories, and coverage receipt.
3. Recover stale jobs only after the heartbeat exceeds the stale threshold.
4. Retry temporary provider/network failures with bounded backoff.
5. Require reconnect for `invalid_grant`; do not retry permanently revoked credentials.
6. Confirm deleted and unauthorized source rows are excluded before restoring search.
7. Roll back application code to the prior Sites version if needed; forward-only migrations remain compatible.

## Deployment verification

Run `npm run beta:check`. Apply migrations before enabling the new job route. Deploy only to the existing Sites project. Verify health/readiness, owner access, job continuation with the browser closed, coverage receipt creation, search evidence, and source opening. Keep the previous Sites version available for application rollback.
