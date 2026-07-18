# Phase 5 Local D1 Canary

Date: 2026-07-18. No deployment was performed.

The active Miniflare D1 database received migrations `0013`, `0014`, and additive replay migration `0015_charming_celestials.sql`. Existing rows were preserved. A real authorized workspace search returned HTTP 200 and created exactly one trace and one receipt. The new trace stored 14 ordered `retrieval-replay-v1` events from authentication through receipt creation. Twenty-six older traces remained readable with null replay data.

Cross-workspace trace and receipt reads returned 404. The replay permission event contained only aggregate counts and reason codes. The secret scan found no committed secret patterns, and the replay implementation does not log file contents.

This is a local Miniflare D1 canary, not a remote production-like D1 latency or memory canary. The previously approved 50,000-file synthetic conflict benchmark remains the conflict performance evidence. A remote controlled canary is still required before production deployment to verify D1 write latency, memory, restart/idempotency, and rollback under hosted limits.
