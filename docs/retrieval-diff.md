# Retrieval Diff

`retrieval-diff-v1` deterministically compares two persisted, authorized retrieval traces. It does not rerun search and does not claim causation. Diff items are ordered by severity, change type, authorized source, and stable serialized before value.

## Comparability

- **Exact:** normalized query, retrieval mode, and file-type scope match.
- **Comparable:** normalized query-token Jaccard overlap is at least 0.60 and mode/scope match.
- **Manual:** the caller explicitly selects materially different traces.
- **Not comparable:** mode or scope materially differs, or token overlap is below 0.60, without the manual flag.

Pagination cursor and page size do not change query scope. The API still returns observed differences for not-comparable traces with the category disclosed.

## Authorization and redaction

Both traces must belong to the same currently authorized workspace. The current connector inventory is revalidated without rerunning either search. Source-level details are returned only for currently authorized indexed file IDs. A prior source that is no longer authorized is represented as `{ "status": "unavailable" }`; its filename, ID, metadata, citation, and contents are not disclosed.

## Supported observed changes

Results, evidence, ranking position and score, citations, coverage, permission accessibility, synchronization freshness, conflict appearance/disappearance/status, explicit authoritative-source decisions, confidence score/label, retrieval mode, and replay-stage status/counts.

The implementation deterministically regenerates diffs and therefore adds no database table or migration. Existing trace and receipt migrations remain unchanged and legacy missing snapshots are handled as availability changes.

## Limitations

The diff can report that two persisted values changed, not why. A source absent from the current searchable authorized inventory is conservatively redacted even if it remains accessible but is temporarily unindexed. Suggested-prior retrieval discovery is not implemented in v1. Hosted D1 canary testing remains required before deployment.
