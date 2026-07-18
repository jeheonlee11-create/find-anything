# Retrieval confidence v1

Retrieval confidence measures the quality and completeness of the evidence returned by Find Anything. It is **not** the probability that an answer is factually correct, and it does not score an LLM answer.

Every calculation stores its inputs, factor points, explanation, calculation time, scoring version, and configuration version in the retrieval trace and search receipt.

## Formula

The v1 score is the sum of ten deterministic factors, rounded to a whole number:

| Factor | Maximum | Measurement |
|---|---:|---|
| Source coverage | 20 | Indexed permission-scoped files / discovered permission-scoped files |
| Connector coverage | 10 | Configured retrieval connectors searched / configured retrieval connectors expected |
| Permission completeness | 15 | Full current inventory plus an allow decision for every loaded file |
| Evidence count | 15 | Distinct cited result files, reaching full credit at five |
| Evidence agreement | 10 | Multiple result sources with no unresolved deterministic conflict signal |
| Evidence freshness | 10 | 10 within 24 hours; 6 within 7 days; 3 within 30 days; otherwise 0 |
| Structural-citation quality | 10 | Citations with exact excerpt, evidence hash, and structural location / all citations |
| Conflict presence | 5 | 5 when deterministic conflict assessment completes with no unresolved signal; otherwise 0 |
| Inaccessible-source impact | 3 | Remaining accessible fraction after failed, pending, unsupported, or absent known files |
| Retrieval-mode limitations | 2 | Literal-only retrieval receives 0 because semantic similarity was not evaluated |

The following safety caps prevent a superficially complete index from producing a misleading score:

- No returned evidence: maximum 35.
- One returned evidence source: maximum 65.
- Incomplete permission evaluation: maximum 49.
- Conflict assessment unavailable: maximum 79.
- One or more unresolved conflict signals: maximum 79.
- Missing or older-than-30-day successful synchronization: maximum 79.

Labels are deterministic:

- **High retrieval confidence:** 80–100
- **Moderate retrieval confidence:** 50–79
- **Low retrieval confidence:** 0–49

## Truthful denominators

Connector coverage includes configured retrieval connectors only. Find Anything does not invent expected Slack, email, or other systems when they are not configured. Disconnected or unknown systems are listed as a limitation rather than guessed into a denominator.

Source coverage uses the permission-scoped source inventory before query filters. A Docs-only filter therefore does not falsely make workspace coverage look worse.

## Limitations

- “No deterministic conflict detected” does not prove that sources agree or that either source is correct.
- Conflict assessment currently uses recorded deterministic numeric-conflict relationships. Phase 3 is required for broader date, status, version, and cross-format conflict detection.
- Freshness measures time since successful permission-scoped synchronization, not whether the source author reviewed the claim recently.
- Literal-only retrieval can miss paraphrases and conceptually related evidence.
- Unknown or disconnected systems are not counted because their contents and permissions cannot be measured truthfully.
