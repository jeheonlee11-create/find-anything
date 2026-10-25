# Security

Find Anything stores OAuth tokens for, and text extracted from, the Google
Drive files users choose to share with it. The controls that protect them are
listed with their code locations in [docs/threat-model.md](docs/threat-model.md).
The product has had no external security review or penetration test and claims
no certification.

## Reporting a vulnerability

Contact the repository owner privately through GitHub; there is no dedicated
security inbox yet. Do not include real secrets or customer content, and do not
test against accounts that are not yours.

## Invariants

- Every read and mutation checks the actor's workspace membership or a
  workspace-scoped API key.
- Search re-checks Drive access at query time and fails closed.
- Tokens are encrypted at rest, bound to their row, and never logged or
  returned to the browser.
- Disconnect revokes the Google grant first and deletes connector data only
  after Google confirms, in one transaction.
- Retrieved file content is treated as untrusted data, never as instructions.
