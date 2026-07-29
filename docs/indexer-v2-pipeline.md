# Indexer v2 — staged incremental pipeline for 10,000+ files

Goal: index at least 10,000 Drive files efficiently on the existing
Cloudflare-Workers + D1 architecture, reusing the durable continuation system
(checkpoints, leases, idempotency, honest counters) already validated at
1,294 files. This is an evolution of `lib/google-drive/sync.ts` +
`lib/indexing/jobs.ts`, not a rewrite.

## Stage map (spec → implementation)

| # | Stage | Where it lands |
|---|---|---|
| 1 | Discovery → metadata index | During `listDriveInventory` pagination, bulk-upsert `source_files` rows (name, path/parents, MIME, size, source id, modifiedAt) per page. Metadata search becomes available the moment pagination completes — before any extraction. |
| 2 | Change detection | `planSyncContinuation` v2: skip when `modifiedTime` matches (as today) **or** when the stored `file_versions.contentHash` equals Drive's `md5Checksum` (content identical though timestamp moved). Google-native files (no md5) keep timestamp+`version` comparison. Counted as `unchanged` vs `duplicate` distinctly. |
| 3 | Extraction | Existing deterministic local parsers (unpdf for PDF, structural Docs/Slides/Sheets, CSV, text). No LLM in this stage — unchanged. |
| 4 | Chunking | Existing `extracted_units` model already preserves file id, page/slide numbers, block locations (`structuralLocationJson`), unit types. Headings: doc paragraphs tagged `heading` level in structural parser where present. |
| 5 | Indexing writes | `db.batch` bulk statements, ≤40 statements per batch (D1-safe), one file's units grouped in one transactional batch with its `file_versions` + `source_files` status rows → per-file durable checkpoint. |
| 6 | AI enrichment | New optional stage behind `INDEXING_AI_ENRICHMENT=claude` + `ANTHROPIC_API_KEY`. Runs only for files that produced zero text units (scanned PDFs, images) or unsupported-but-exportable formats, after content indexing. Default **off**: no key, no calls, no document contents leave the boundary. Results stored as `extraction_mode: "ai_enriched"`. |
| 7 | Checkpointing | Already per-continuation; tightened to per-file (stage-5 batching). Interrupted jobs resume from `file_versions`/`source_files` status — completed files are never redone (existing tests). |
| 8 | Failure/retry | Files that fail extraction are marked `failed` with `retryCount`; a dedicated retry pass runs after the main queue drains, up to `MAX_FILE_RETRIES = 2`, without blocking healthy files. Exhausted files stay honestly `failed` and are counted. |

## Processing order (priority classes)

Within each continuation hop, pending files are ordered by:
1. `modifiedTime` recency bucket (last 30 days first),
2. common formats (Docs/Slides/Sheets/PDF/text) before others,
3. `sizeBytes` ascending,
4. everything else / large or repeatedly-failing files last.

Implemented as a deterministic `priorityClass(file)` (0–3) + sort, so ordering
is stable and testable.

## Batching & adaptive concurrency

- Work window: up to **500 files** claimed per continuation (ids + minimal
  metadata only — never full contents in memory).
- Within a hop, an adaptive pool starts at **20 concurrent** file
  extractions; on a 429/5xx/timeout the pool halves (floor 2) with jittered
  backoff, and grows by +2 per clean batch back to the cap. Only file
  *handles* stream through the pool; each file's export is fetched, parsed,
  written, and released before the slot is reused.
- Hop budget remains time-boxed with the extraction deadline set fresh after
  (checkpointed) discovery, so budget exhaustion checkpoints and continues —
  never restarts.

## Progressive search availability

- After stage 1: title/filename/path/MIME search works (`source_files` rows
  exist with `index_status: "metadata"`).
- As stage 5 commits each file, full-text results appear for it. The UI
  labels the state: "Searchable by name (N) · full-text ready (M of T)".

## Later runs (incremental)

Discovery diffs the inventory: new (no row), modified (timestamp/hash
mismatch), deleted/moved (row absent from inventory or parents changed —
existing removed/unauthorized handling), unchanged (skip), duplicate-content
(hash match — metadata refresh only).

## Counters, rates, ETA

`indexing_jobs` gains: `metadataIndexedCount`, `contentIndexedCount`,
`unchangedCount`, `duplicateCount`, `retriedCount` (migration 0019, additive,
forward-only). Rates: files/min over the trailing window of completed
continuations (persisted `hopStats`); ETA = remaining ÷ rate, shown only when
at least 3 hops of signal exist. "Last durable checkpoint" = the newest
continuation `completed_at` (already persisted).

## Explicit non-goals in this pass

- **Embeddings**: search stays deterministic/literal (product positioning;
  the strategy memo defers semantic search). The chunk store is
  embedding-ready (stable unit ids + hashes) and a `batchEmbed()` seam exists
  behind `INDEXING_EMBEDDINGS` (default off, no vendor chosen).
- **LLM text extraction**: never for ordinary text (stage 3 is local and
  deterministic); Claude only in the flagged enrichment stage.

## Scale envelope (10k files)

- Discovery: 10 Drive pages ≈ 1–2 continuations.
- Metadata: 10k upserts ÷ ~40/batch ≈ 250 batches across those hops.
- Content: 10k ÷ (20 concurrent × ~1.5 s/file) ≈ ~13 min of pure work,
  spread across time-boxed hops; queue-driven when the queue flag is on,
  poll-driven otherwise.
- D1 volumes: ~10k `source_files`, ~10k `file_versions`, 100k–500k
  `extracted_units` — well inside D1 limits; existing per-workspace indexes
  cover the query paths.
