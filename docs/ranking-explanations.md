# Explain Why This Result Ranked

Ranking version: `literal-ranking-v4`. Explanation version: `ranking-explanation-v1`.

Every displayed reason is emitted by the same factor calculation that produces the final score. Explanations are never generated after ranking.

## Best Matches formula

The final score is the sum of these contributions:

| Factor | Contribution |
| --- | ---: |
| Exact query equals title | +120 |
| Exact query phrase in filename | +70 |
| Exact query phrase in content | +45 |
| Normalized title-token overlap | +10 per token, maximum +40 |
| Filename token match | +20 per token, maximum +60 |
| Title token match | +30 per token, maximum +90 |
| Structured heading match | +25 per token, maximum +50 |
| Literal content occurrences | +4 each, maximum +40 |
| Freshness | +12 initially, declining one point per 30 days to zero |
| Structurally cited evidence | +8 |
| User-designated authoritative source | +20 |
| Conflict assessment completed with no unresolved conflict for this result | +5 |
| Unresolved deterministic conflict | −35 |
| Literal retrieval mode | 0; disclosed limitation |
| Semantic similarity | inactive and 0 while semantic retrieval is disabled |

Freshness, authority, and conflict values come from stored metadata or explicit review decisions. Modified time never implies authority. Permission filtering is an eligibility stage and contributes no relevance points.

## Ordering

Best Matches sorts by final score descending, then stored modified time descending, then stable file ID ascending. Each displayed result records why it ranked above the next result.

Find All remains exhaustive: all literal matches are sorted by filename and then stable file ID. Scores and explanations are still recorded, but do not change Find All ordering or impose a top-k limit. Cursor pagination uses that stable order.

Search responses contain the complete factor list, penalties, inactive factors, concise explanation, advanced raw breakdown, position, and nearby-result comparison. Traces and receipts persist exactly the displayed breakdown. Legacy audit records return `rankingExplanations: null`.
