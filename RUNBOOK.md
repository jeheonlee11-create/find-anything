# Operations runbook

- Health/readiness: verify `/api/health` and `/api/readiness`; production readiness must include database, workers, connector, billing, and email.
- Connector lag: pause new indexing, inspect OAuth expiry/rate limits, retry with bounded backoff, reconcile deletions and permissions.
- Search latency: separate keyword, vector, permission, and reranking stages; protect completeness semantics while shedding optional work.
- Billing webhook: verify signature/replay window, inspect idempotency record, replay only through the audited handler.
- Deletion backlog: stop account reactivation, prioritize source-token revocation and hard-delete jobs, preserve only legally required audit metadata.
- Backup: verify latest successful backup and scheduled restore drill; never assume a backup is restorable.
