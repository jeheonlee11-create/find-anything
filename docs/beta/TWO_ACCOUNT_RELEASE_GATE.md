# Two-account production release gate

Use two real invited ChatGPT accounts and two different Google test accounts. Record timestamps, workspace IDs, job IDs, trace IDs, receipt IDs, and pass/fail only; never copy tokens or private document text into the report.

## Account isolation

- Account A creates Workspace A; Account B creates Workspace B.
- A cannot open Workspace B by URL and receives a safe not-found response.
- B cannot open Workspace A by URL.
- A cannot read B's connector, job, run, file, trace, receipt, failure, or coverage IDs by guessing URLs or API parameters.
- B cannot search Workspace A, and A cannot search Workspace B.
- Both users can index simultaneously without connector, file-ID, counter, or result overlap.

## OAuth and connector lifecycle

- Each account connects its own Drive using the read-only scope.
- Force Account A's access token near expiry; a server-side refresh succeeds without reconnecting.
- Confirm concurrent requests cause one refresh operation.
- Confirm an omitted rotated refresh token preserves the stored encrypted refresh token.
- Revoke Account A's Google consent; the connector becomes `reauthorization_required`, search fails closed, and indexed data remains stored but unavailable.
- Reconnect A and confirm search returns after permission revalidation.
- Disconnect B; Google revocation succeeds and B's connector credentials and indexed data are deleted.

## Indexing and reconciliation

- Start indexing, close the browser immediately, then return from another device/tab.
- The job advances without repeated clicks and reaches completed or partial.
- Create a file: next sync reports added and makes it searchable.
- Edit a file: next sync reports updated and replaces old evidence.
- Rename and move a file: title, parents, and source link update without duplication.
- Leave a file unchanged: next sync reports unchanged and does not duplicate units.
- Delete or revoke one file: it disappears from search before or during reconciliation and old extracted units are removed.
- Verify inventory, searchable, unsupported, failed, freshness, and extraction coverage labels use the documented denominators.

## Retrieval trust

- Search an exact phrase in a Doc, Sheet, Slide, and PDF.
- Confirm exact evidence, structural location, hash, ranking explanation, trace, and receipt.
- Open source and confirm the matching Google file.
- Confirm stable Find All order and pagination.
- Confirm files from the other account never appear.

Do not mark the private-beta release gate passed until every item above has recorded production evidence.
