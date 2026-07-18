# Retrieval Replay

`retrieval-replay-v1` is a stored, ordered event snapshot attached to a retrieval trace. The trace is the source of truth. The UI never synthesizes missing events; legacy traces return `replay: null` and display **Replay unavailable**.

Each event stores a sequence number, stable stage key, user-facing label and summary, start timestamp when instrumented, duration when instrumented, input/output/excluded counts when observable, warning count, reason codes, configuration version, status, and privacy-safe metadata.

The recorded order is authentication, workspace authorization, connector selection, permission inventory, conflict lookup, coverage evaluation, candidate generation, permission filtering, literal matching, semantic matching status, ranking, citation generation, confidence calculation, and receipt creation. This reflects the current runtime boundaries. Measurements not independently captured are `null` and displayed as **Unavailable**.

Permission-filtered records expose aggregate counts and `CANDIDATES_FILTERED_WITHOUT_IDENTIFIERS`; filenames, source IDs, metadata, contents, and credentials are excluded. Trace access continues to require the trace owner or a workspace-scoped API key. The MCP trace tool uses the same authorized serialization.

## Rollback

The migration is additive. Rolling application code back leaves the nullable replay columns unused. Do not drop the columns during rollback. New traces remain readable by older code, and old traces remain readable by new code with `replay: null`.

## Instrumentation gaps

Authentication completes before search replay timing begins. Connector selection, coverage evaluation, candidate generation, permission filtering, ranking, and citation generation currently share broader runtime boundaries, so their independent timestamps and durations are unavailable. A failed request before audit persistence does not yet create a durable trace; `failed` is supported by the event schema for persisted failure instrumentation without inventing measurements.
