# Indexer v2 — staged incremental pipeline for 10,000+ files

Goal: index at least 10,000 Drive files efficiently on the existing
Cloudflare-Workers + D1 architecture, reusing the durable continuation system
(checkpoints, leases, idempotency, honest counters) already validated at
1,294 files. This is an evolution of `lib/google-drive/sync.ts` +
`lib/indexing/jobs.ts`, not a rewrite.

## Stage map (spec → implementation)

| # | Stage | Where it lands |
|---|---|---|
| 1 | Discovery → metadata index | During `listDriveInventory` pagination, bulk-upsert `source_files` rows (name, path/parents, MIME, size, source id, modifiedAt) per page, with `next_page_token` checkpointed on `sync_runs`. Pagination is durably resumable: a hop that runs out of time or subrequest budget saves its cursor and the next hop continues from it instead of re-listing page 1. Metadata search becomes available the moment pagination completes — before any extraction. Discovery never writes `md5_checksum`. |
| 2 | Change detection | `planSyncContinuation` v2: skip when `modifiedTime` matches (as today) **or** when the content checksum recorded by a completed extraction equals Drive's `md5Checksum` (content identical though timestamp moved). That checksum is written only by `persistExtractedFile`, in the same transactional batch as the `file_versions` row (`extraction_status` complete) and the `index_status = 'indexed'` flip, so **a file with no persisted extraction can never be classified as a duplicate**. Google-native files (no md5) keep timestamp+`version` comparison. Counted as `unchanged` vs `duplicate` distinctly, where `unchanged` means "settled by a PRIOR run", not "already done by an earlier hop of this run". |
| 3 | Extraction | Existing deterministic local parsers (unpdf for PDF, structural Docs/Slides/Sheets, CSV, text). No LLM in this stage — unchanged. |
| 4 | Chunking | Existing `extracted_units` model already preserves file id, page/slide numbers, block locations (`structuralLocationJson`), unit types. Headings: doc paragraphs tagged `heading` level in structural parser where present. |
| 5 | Indexing writes | `db.batch` bulk statements, ≤40 statements per batch and **≤99 bound parameters per statement**. Multi-row statements are sized by parameter count derived from `db/schema.ts` (`lib/indexing/d1-limits.ts`), never by a hardcoded row count — a 12-row × 9-column insert is 108 parameters and D1 rejects it outright. One file's units are grouped in one transactional batch with its `file_versions` + `source_files` status rows → per-file durable checkpoint. When a file's units span more than one batch, the version row is written `partial` and only flipped to `complete` after the last unit statement, so an interrupted write never claims an extraction it did not finish. |
| 6 | AI enrichment | New optional stage behind `INDEXING_AI_ENRICHMENT=claude` + `ANTHROPIC_API_KEY`. Runs only for files that produced zero text units (scanned PDFs, images) or unsupported-but-exportable formats, after content indexing. Default **off**: no key, no calls, no document contents leave the boundary. Even when on, a call happens **only when real document bytes are being sent** — never a filename-only prompt, and candidates whose bytes cannot be fetched are skipped — so model output can never be persisted as extracted content for a document nobody read. Results stored as `extraction_mode: "ai_enriched"`. |
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

- **Subrequest budget.** A Workers invocation may issue at most 50 subrequests
  on the free plan and 1000 on paid plans, and every Drive fetch *and* every D1
  batch counts. Each hop carries an explicit counter
  (`lib/indexing/subrequest-budget.ts`), default **45** with a closing reserve
  of 8, overridable with `INDEXING_SUBREQUEST_BUDGET`. Exhaustion always
  produces a durable checkpoint plus a scheduled continuation — fail-safe,
  never a thrown hop and never fail-stuck.
- Work window: derived from the budget the hop has left
  (`floor(available / 4 subrequests per file)`), capped at **500 files** per
  continuation (ids + minimal metadata only — never full contents in memory).
  On the free-plan default this is a handful of files per hop; a paid-plan
  budget of 1000 raises it to ~245. It is never a hardcoded 500.
- Within a hop, an adaptive pool starts at **20 concurrent** file
  extractions; on a 429/5xx/timeout the pool halves (floor 2) with jittered
  backoff, and grows by +2 per clean batch back to the cap. Only file
  *handles* stream through the pool; each file's export is fetched, parsed,
  written, and released before the slot is reused.
- **Memory admission.** Slots alone do not bound memory (20 × 50 MB is 1 GB in
  a 128 MB isolate), so the pool also admits by aggregate in-flight bytes
  (≤32 MB, from the `sizeBytes` discovery already stores; Google-native files,
  which have no size, reserve their 4 MB export cap). Files above a 24 MB
  per-file cap are settled with a distinct counted status
  (`FILE_TOO_LARGE_TO_EXTRACT`, surfaced as `indexing_jobs.oversized_count`)
  instead of being re-admitted into the same fatal window every hop.
- Hop budget remains time-boxed with the extraction deadline set fresh after
  (checkpointed) discovery, so budget exhaustion checkpoints and continues —
  never restarts.

## Progressive search availability

- After stage 1: title/filename/path/MIME search works (`source_files` rows
  exist with `index_status: "metadata"`). Those rows really are matched by
  `searchWorkspaceFiles`, on name/path/MIME only: a name-only hit carries
  `matchScope: "name_only"`, no snippet and no citation, and is labelled in the
  UI, so it can never imply content was read. Content and phrase matching still
  require extracted text.
- As stage 5 commits each file, full-text results appear for it. The UI
  labels the state: "Searchable by name (N) · full-text ready (M of T)", both
  numbers read straight from `source_files`.

## Later runs (incremental)

Discovery diffs the inventory: new (no row), modified (timestamp/hash
mismatch), deleted/moved (row absent from inventory or parents changed —
existing removed/unauthorized handling), unchanged (skip), duplicate-content
(hash match — metadata refresh only).

## Counters, rates, ETA

`indexing_jobs` gains: `metadataIndexedCount`, `contentIndexedCount`,
`unchangedCount`, `duplicateCount`, `retriedCount` (migration 0019) and
`oversizedCount` (migration 0020) — all additive and forward-only. Rates:
files/min over the trailing window of completed continuations (persisted
`hopStats`); ETA = remaining ÷ rate, shown only when at least 3 hops of signal
exist. "Last durable checkpoint" = the newest continuation `completed_at`
(already persisted).

Counter rules, all enforced in `lib/indexing/continuation-fence.ts`:

- **Monotonic.** In-hop heartbeats may only *raise* a counter
  (`max(persisted, reported)`). A fresh hop starting at zero must never make
  the UI sawtooth 9,500 → 0 → 9,700.
- **Accumulated.** Per-hop event counts (`duplicateCount`, `retriedCount`,
  `oversizedCount`) add to the persisted value instead of replacing it with the
  next hop's zero. Only duplicates whose metadata refresh actually committed
  are counted, so accumulation cannot double count.
- **Fenced.** The whole completion batch is guarded on the continuation still
  being `worker_started` and still owned by this hop's execution lease, so a
  lease-expired zombie's late commit is a no-op and the accumulating writes
  happen exactly once.
- **DB-truth.** `contentIndexedCount` counts only files the DB persisted as
  `indexed` (a zero-unit scanned PDF is stored `unsupported` and counted that
  way), `metadataIndexedCount` is a `count(*)` of committed rows, and the
  coverage receipt reads the persisted job row rather than the last hop's
  in-memory view.
- **Retries.** `retry_count` and `retriedCount` are charged inside the worker
  at the moment a file is actually re-attempted. Charging a whole candidate
  list up front let two deadline-clipped hops exhaust `MAX_FILE_RETRIES` with
  zero real re-extraction.

## Explicit non-goals in this pass

- **Embeddings**: search stays deterministic/literal (product positioning;
  the strategy memo defers semantic search). The chunk store is
  embedding-ready (stable unit ids + hashes) and a `batchEmbed()` seam exists
  behind `INDEXING_EMBEDDINGS` (default off, no vendor chosen).
- **LLM text extraction**: never for ordinary text (stage 3 is local and
  deterministic); Claude only in the flagged enrichment stage.

## Scale envelope (10k files)

- Discovery: 10 Drive pages, spread over as many continuations as the
  subrequest budget requires; the cursor is durable, so each hop makes forward
  progress and none re-lists page 1.
- Metadata: 10k upserts ÷ 3 rows per statement ÷ 40 statements per batch ≈ 84
  batches across those hops.
- D1 volumes: ~10k `source_files`, ~10k `file_versions`, 100k–500k
  `extracted_units` — well inside D1 limits; existing per-workspace indexes
  cover the query paths.
- Content throughput is bounded by the subrequest budget, not by CPU. Each
  extraction hop rebuilds the inventory from Drive (~10 page requests for 10k
  files) before extracting, so the honest per-hop capacity is
  `floor((budget − pagination − fixed writes − reserve) / 4)`:
  - **Free plan (default budget 45): a few files per hop.** 10k files is
    therefore many thousands of hops. It completes, and every hop is durable,
    but it is slow by design rather than by accident.
  - **Paid plan (`INDEXING_SUBREQUEST_BUDGET=1000`): ~240 files per hop**, so
    10k files is ≈40 extraction hops.
  Raising free-plan throughput requires rebuilding the extraction hop's
  inventory from `source_files` instead of re-listing Drive, which needs
  discovery to record provider-side change signals; that is deliberately out of
  scope for this pass and is the next thing to do here.
