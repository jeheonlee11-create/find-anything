# Deterministic Conflict Detection

`deterministic-conflicts-v1` compares only currently authorized, indexed files with related normalized filenames. It never selects a correct source. Every signal stores the two detected values, detection method, exact structural citations, source links, and any modified-time relationship inference separately.

## Supported rules

- Currency amounts: different normalized `$` or `USD` amounts in related files.
- Dates: different ISO or English month dates in related files.
- Approval status: `approved`, `not approved`, `pending approval`, or `rejected` differs.
- Version labels: different `vN` or `version N` labels.
- Draft versus final: related filenames explicitly carry different draft/final states.
- Duplicate filename/content: identical normalized filenames have different extracted-content hashes.
- Newer contradicts older: a stored modified timestamp identifies the newer of two sources that already have a deterministic value conflict. Newer is never treated as authoritative.

Candidate files must share at least half of their normalized filename tokens. This deliberately narrow gate reduces false positives but can miss conflicts between differently named sources. Only the first supported value of each type in each file is compared in v1.

## Review decisions

Conflicts begin `unresolved`. A workspace-authorized reviewer may record `authoritative_source`, `expected_difference`, `resolved`, or `false_positive`. Authoritative-source decisions must identify one of the two cited files. Decisions are stored rather than deleting the detection.

Unresolved conflicts reduce retrieval confidence and cap it below High. Resolved or classified conflicts remain visible in traces and receipts but no longer count as unresolved.

Browser, developer API, and MCP routes revalidate workspace/connector authorization and fail closed before returning conflict evidence. No LLM is used.
