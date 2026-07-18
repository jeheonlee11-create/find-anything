# Conflict Performance Gate

Benchmark date: 2026-07-18. Synthetic data only; no private file content was used.

The original all-pairs search-time implementation was rejected because 50,000 high-overlap files could require approximately 1.25 billion comparisons. Conflict detection now runs after indexing, groups normalized filenames, and compares each file with at most the four adjacent versions in deterministic modified-time order. Searches read persisted, permission-revalidated conflicts.

| Files | Corpus | Candidate ms | Pairs | Compare ms | Conflicts | Persist ms | Total indexing conflict ms | Search read ms | Peak MiB | Reads/Writes |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | low overlap | 3.293 | 0 | 0.111 | 0 | 0.003 | 3.560 | 0.018 | 4.97 | 1 / 0 |
| 1,000 | high overlap | 20.940 | 3,990 | 19.692 | 0 | 0.006 | 40.644 | 0.020 | 16.95 | 1 / 0 |
| 10,000 | low overlap | 16.422 | 0 | 0.031 | 0 | 0.004 | 16.464 | 0.015 | 12.73 | 1 / 0 |
| 10,000 | high overlap | 80.771 | 39,990 | 180.370 | 270 | 0.638 | 261.789 | 0.041 | 85.80 | 1 / 270 |
| 50,000 | low overlap | 84.759 | 0 | 0.032 | 0 | 0.006 | 84.806 | 0.013 | 33.72 | 1 / 0 |
| 50,000 | high overlap | 374.417 | 199,990 | 1,698.610 | 1,470 | 3.112 | 2,076.144 | 0.148 | 182.16 | 1 / 1,470 |

Database persistence and reads used an in-memory SQLite table. Reported memory is process RSS growth. Production D1 latency will be higher and must be canary-measured.

## Deployment threshold

Conflict processing is eligible for controlled production only when a 50,000-file high-overlap canary remains below: 5 seconds indexing conflict time, 256 MiB additional memory, 250,000 candidate pairs, and 100 ms conflict read contribution to search p95. Candidate comparisons must remain at most `4 × file count` asymptotically. A threshold breach blocks production rollout until a tested fallback can preserve prior detection history and mark the assessment incomplete; this benchmark gate is not presented as an automatic runtime circuit breaker.

The four-version comparison window is a deliberate recall/performance tradeoff: conflicts between versions farther apart may be missed until a more targeted candidate key is available.
