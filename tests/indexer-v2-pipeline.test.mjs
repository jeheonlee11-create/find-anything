import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  isExtractableDriveMimeType,
  isOversizedForExtraction,
  MAX_EXTRACTABLE_FILE_BYTES,
  MAX_FILE_RETRIES,
  MAX_IN_FLIGHT_EXTRACTION_BYTES,
  planSyncContinuation,
  sortPendingDriveFiles,
} from "../lib/google-drive/sync-lifecycle.ts";
import { runPool } from "../lib/indexing/adaptive-pool.ts";
import {
  enrichFile,
  enrichmentEnabled,
  selectEnrichmentCandidates,
} from "../lib/indexing/enrichment.ts";
import { indexingRateFromHops } from "../lib/indexing/job-lifecycle.ts";
import {
  createSubrequestBudget,
  DEFAULT_SUBREQUEST_BUDGET,
  subrequestBudgetLimit,
  SUBREQUESTS_PER_FILE,
  workWindowFromBudget,
} from "../lib/indexing/subrequest-budget.ts";
import { listAllDriveFiles } from "../lib/google-drive/client.ts";
import { searchWorkspaceFiles } from "../lib/workspace-search/core.ts";

const NOW = Date.parse("2026-07-29T00:00:00.000Z");
const DEFAULT_POOL = {
  initial: 20,
  min: 2,
  max: 20,
  now: () => NOW,
  rng: () => 0.5,
  sleep: () => Promise.resolve(),
};

/**
 * Synthetic-fixture simulation of the staged pipeline in
 * lib/google-drive/sync.ts, built on the SAME pure modules the production
 * hop uses (planSyncContinuation, sortPendingDriveFiles, runPool,
 * MAX_FILE_RETRIES) with an in-memory source_files store that mirrors the
 * repository's persistence semantics (metadata-first upserts preserve change
 * detection; per-file transactional persists; retry budget resets on
 * success). No network, no database.
 */
class SimulatedDriveIndexer {
  constructor(inventory, { windowSize = 500, failures = new Map() } = {}) {
    this.inventory = inventory;
    this.windowSize = windowSize;
    this.failures = new Map(failures);
    this.store = new Map();
    this.extractionCalls = 0;
    this.retriedTotal = 0;
  }

  discover() {
    // Metadata-first: every discovered file gets a name-searchable row; rows
    // that already exist keep modified_at / content hash / status untouched.
    for (const file of this.inventory)
      if (!this.store.has(file.id))
        this.store.set(file.id, {
          modifiedAt: file.modifiedTime,
          indexStatus: "metadata",
          extractionMode: null,
          contentHash: null,
          retryCount: 0,
          nameSearchable: true,
        });
  }

  snapshotPrevious() {
    return [...this.store.entries()].map(([sourceId, row]) => ({
      sourceId,
      modifiedAt: row.modifiedAt,
      indexStatus: row.indexStatus,
      extractionMode: row.extractionMode,
      contentHash: row.contentHash,
      retryCount: row.retryCount,
    }));
  }

  persist(file, status) {
    // Mirrors persistExtractedFile: one durable per-file write that lands
    // metadata + status together and resets the retry budget.
    this.store.set(file.id, {
      modifiedAt: file.modifiedTime,
      indexStatus: status,
      extractionMode: status === "indexed" ? "native" : "unsupported",
      contentHash: file.md5Checksum ?? null,
      retryCount: 0,
      nameSearchable: status === "indexed",
    });
  }

  markFailed(file, errorCode) {
    const row = this.store.get(file.id);
    row.indexStatus = "failed";
    row.extractionMode = null;
    row.nameSearchable = false;
    row.errorCode = errorCode;
  }

  async extractionHop({ crashAfterFiles = Infinity, pool = DEFAULT_POOL } = {}) {
    this.discover();
    const previous = this.snapshotPrevious(),
      plan = planSyncContinuation(this.inventory, previous),
      counters = {
        discovered: this.inventory.length,
        metadataIndexed: this.inventory.length,
        processed: plan.filesProcessed,
        unchanged: plan.filesUnchanged,
        duplicate: plan.filesDuplicate,
        indexed: plan.filesIndexed,
        unsupported: plan.filesUnsupported,
        failed: plan.filesFailed,
        retried: 0,
      };
    // Duplicates: refresh metadata only, never re-extract.
    for (const file of plan.duplicateFiles)
      this.store.get(file.id).modifiedAt = file.modifiedTime;
    const unsupported = plan.pendingFiles.filter(
      (file) => !isExtractableDriveMimeType(file.mimeType),
    );
    for (const file of unsupported) {
      this.persist(file, "unsupported");
      counters.processed += 1;
      counters.unsupported += 1;
    }
    const extractable = sortPendingDriveFiles(
        plan.pendingFiles.filter((file) =>
          isExtractableDriveMimeType(file.mimeType),
        ),
        {
          now: NOW,
          previouslyFailed: (sourceId) =>
            plan.previousBySourceId.get(sourceId)?.indexStatus === "failed",
        },
      ),
      window = extractable.slice(0, this.windowSize),
      hopFailures = [];
    let crashed = false,
      mainProcessed = 0;
    const extract = (pass) => async (file) => {
      if (crashed) return;
      if (pass === "main" && mainProcessed >= crashAfterFiles) {
        crashed = true;
        return;
      }
      if (pass === "main") mainProcessed += 1;
      this.markFailed(file, "SYNC_FILE_INTERRUPTED");
      this.extractionCalls += 1;
      const remainingFailures = this.failures.get(file.id) ?? 0;
      if (remainingFailures > 0) {
        this.failures.set(file.id, remainingFailures - 1);
        this.markFailed(file, "GOOGLE_DRIVE_HTTP_500");
        if (pass === "main") {
          counters.failed += 1;
          hopFailures.push({
            file,
            retryCountBefore:
              plan.previousBySourceId.get(file.id)?.retryCount ?? 0,
          });
        }
        return;
      }
      this.persist(file, "indexed");
      counters.indexed += 1;
      if (pass === "retry") counters.failed = Math.max(0, counters.failed - 1);
    };
    await runPool(
      window,
      async (file) => {
        const processedBefore = mainProcessed;
        await extract("main")(file);
        if (mainProcessed > processedBefore) counters.processed += 1;
      },
      pool,
    );
    const stoppedEarly = crashed || extractable.length > window.length;
    if (!stoppedEarly) {
      const retryCandidates = [
        ...hopFailures
          .filter((entry) => entry.retryCountBefore < MAX_FILE_RETRIES)
          .map((entry) => entry.file),
        ...plan.retryableFiles,
      ];
      if (retryCandidates.length) {
        for (const file of retryCandidates)
          this.store.get(file.id).retryCount += 1;
        counters.retried = retryCandidates.length;
        this.retriedTotal += retryCandidates.length;
        await runPool(retryCandidates, extract("retry"), pool);
      }
    }
    return { ...counters, continuationNeeded: stoppedEarly };
  }

  async runJob(options = {}) {
    this.discover();
    let hops = 0,
      counters;
    do {
      counters = await this.extractionHop(options);
      hops += 1;
      if (hops > 80) throw new Error("SIMULATED_JOB_DID_NOT_CONVERGE");
    } while (
      counters.continuationNeeded ||
      counters.processed < this.inventory.length
    );
    return { ...counters, hops };
  }

  statusCounts() {
    const counts = { metadata: 0, indexed: 0, unsupported: 0, failed: 0 };
    for (const row of this.store.values()) counts[row.indexStatus] += 1;
    return counts;
  }

  nameSearchableCount() {
    return [...this.store.values()].filter((row) => row.nameSearchable).length;
  }
}

function syntheticDrive({ docs, pdfs, images }) {
  const files = [];
  for (let index = 0; index < docs; index += 1)
    files.push({
      id: `doc-${index}`,
      name: `Doc ${index}`,
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2026-01-05T00:00:00.000Z",
      size: String(1_000 + index),
    });
  for (let index = 0; index < pdfs; index += 1)
    files.push({
      id: `pdf-${index}`,
      name: `Report ${index}.pdf`,
      mimeType: "application/pdf",
      modifiedTime: "2026-02-10T00:00:00.000Z",
      md5Checksum: `md5-pdf-${index}`,
      size: String(2_000 + index),
    });
  for (let index = 0; index < images; index += 1)
    files.push({
      id: `img-${index}`,
      name: `Photo ${index}.png`,
      mimeType: "image/png",
      modifiedTime: "2026-03-15T00:00:00.000Z",
      md5Checksum: `md5-img-${index}`,
      size: String(3_000 + index),
    });
  return files;
}

test("metadata-first discovery makes every file name-searchable before extraction", async () => {
  const indexer = new SimulatedDriveIndexer(
    syntheticDrive({ docs: 5, pdfs: 3, images: 2 }),
  );
  indexer.discover();
  assert.equal(indexer.nameSearchableCount(), 10);
  assert.equal(indexer.statusCounts().metadata, 10);
  assert.equal(indexer.extractionCalls, 0);
  await indexer.runJob();
  assert.equal(indexer.statusCounts().indexed, 8);
  assert.equal(indexer.statusCounts().unsupported, 2);
});

test("a crash after file N durably keeps 1..N and resumes at N+1", async () => {
  const serialPool = { ...DEFAULT_POOL, initial: 1, min: 1, max: 1 };
  const indexer = new SimulatedDriveIndexer(
    syntheticDrive({ docs: 10, pdfs: 0, images: 0 }),
    { windowSize: 500 },
  );
  indexer.discover();
  const crashedHop = await indexer.extractionHop({
    crashAfterFiles: 4,
    pool: serialPool,
  });
  assert.equal(crashedHop.continuationNeeded, true);
  assert.equal(indexer.statusCounts().indexed, 4);
  assert.equal(indexer.extractionCalls, 4);
  // Resume: completed files are never redone; the hop picks up at file 5.
  const resumedHop = await indexer.extractionHop({ pool: serialPool });
  assert.equal(indexer.extractionCalls, 4 + 6);
  assert.equal(resumedHop.continuationNeeded, false);
  assert.equal(resumedHop.processed, 10);
  assert.equal(resumedHop.unchanged, 4);
  assert.equal(indexer.statusCounts().indexed, 10);
});

test("the retry pass never blocks first-pass files and honors the retry budget", async () => {
  const files = syntheticDrive({ docs: 30, pdfs: 0, images: 0 });
  const indexer = new SimulatedDriveIndexer(files, {
    windowSize: 10,
    failures: new Map([
      ["doc-0", 1], // transient: succeeds on its retry
      ["doc-1", Infinity], // permanent: stays failed once the budget is spent
    ]),
  });
  const hop1 = await indexer.extractionHop();
  // Window overflow means first-pass files remain: no retries may run yet.
  assert.equal(hop1.continuationNeeded, true);
  assert.equal(hop1.retried, 0);
  const result = await indexer.runJob();
  assert.equal(result.processed, 30);
  // Both failures retried once when the queue drained; the transient one
  // recovered, the permanent one stayed honestly failed.
  assert.equal(indexer.statusCounts().indexed, 29);
  assert.equal(indexer.statusCounts().failed, 1);
  assert.equal(indexer.store.get("doc-0").retryCount, 0); // reset on success
  assert.ok(indexer.store.get("doc-1").retryCount >= 1);
  // Later jobs keep retrying only until MAX_FILE_RETRIES is spent.
  await indexer.runJob();
  await indexer.runJob();
  assert.equal(indexer.store.get("doc-1").retryCount, MAX_FILE_RETRIES);
  const settledPlan = planSyncContinuation(files, indexer.snapshotPrevious());
  assert.equal(settledPlan.retryableFiles.length, 0);
});

test("a 10,000-file synthetic drive completes through continuations with exact accounting", async () => {
  const files = syntheticDrive({ docs: 6000, pdfs: 2500, images: 1500 });
  // 30 transient + 20 permanent extraction failures, prioritized into the
  // first window via recent modification timestamps and small sizes.
  const failures = new Map();
  for (let index = 0; index < 30; index += 1) {
    files[index].modifiedTime = "2026-07-20T00:00:00.000Z";
    files[index].size = String(10 + index);
    failures.set(files[index].id, 1);
  }
  for (let index = 30; index < 50; index += 1) {
    files[index].modifiedTime = "2026-07-20T00:00:00.000Z";
    files[index].size = String(10 + index);
    failures.set(files[index].id, Infinity);
  }
  const indexer = new SimulatedDriveIndexer(files, {
    windowSize: 500,
    failures,
  });
  const result = await indexer.runJob();
  // 8500 extractable across a 500-file work window per continuation.
  assert.ok(result.hops >= 17, `expected >= 17 hops, saw ${result.hops}`);
  assert.equal(result.discovered, 10_000);
  assert.equal(result.metadataIndexed, 10_000);
  assert.equal(result.processed, 10_000);
  assert.equal(result.indexed, 8_480);
  assert.equal(result.unsupported, 1_500);
  assert.equal(result.failed, 20);
  // Retries ran once per failure after the whole queue drained.
  assert.equal(indexer.retriedTotal, 50);
  assert.deepEqual(indexer.statusCounts(), {
    metadata: 0,
    indexed: 8_480,
    unsupported: 1_500,
    failed: 20,
  });
  assert.equal(indexer.extractionCalls, 8_500 + 50);
  // Exact accounting identity over persisted state.
  const { indexed, unsupported, failed } = indexer.statusCounts();
  assert.equal(indexed + unsupported + failed, 10_000);

  // Incremental second job: 400 pdfs move timestamps with identical content
  // (hash duplicates, metadata refresh only) and 100 docs genuinely change.
  for (let index = 100; index < 500; index += 1)
    files[6000 + index].modifiedTime = "2026-07-28T00:00:00.000Z";
  for (let index = 100; index < 200; index += 1)
    files[index].modifiedTime = "2026-07-28T09:00:00.000Z";
  const callsBefore = indexer.extractionCalls;
  const second = await indexer.runJob();
  assert.equal(second.duplicate, 400);
  assert.equal(second.unchanged, 9_500);
  assert.equal(second.processed, 10_000);
  assert.equal(second.indexed, 8_480);
  assert.equal(second.failed, 20);
  // Only the 100 modified docs were re-extracted plus 20 final retries —
  // duplicates never touched the extractors.
  assert.equal(indexer.extractionCalls - callsBefore, 100 + 20);
  assert.equal(indexer.store.get("pdf-100").modifiedAt, "2026-07-28T00:00:00.000Z");
  // The permanent failures have now exhausted their retry budget for good.
  const third = await indexer.runJob();
  assert.equal(third.retried, 0);
});

test("enrichment stays a strict no-op unless both flag and key are present", async () => {
  assert.equal(enrichmentEnabled(undefined), false);
  assert.equal(enrichmentEnabled({}), false);
  assert.equal(enrichmentEnabled({ INDEXING_AI_ENRICHMENT: "claude" }), false);
  assert.equal(enrichmentEnabled({ ANTHROPIC_API_KEY: "sk-test" }), false);
  assert.equal(
    enrichmentEnabled({ INDEXING_AI_ENRICHMENT: "off", ANTHROPIC_API_KEY: "sk-test" }),
    false,
  );
  assert.equal(
    enrichmentEnabled({ INDEXING_AI_ENRICHMENT: "claude", ANTHROPIC_API_KEY: "sk-test" }),
    true,
  );
  const networkTouched = () => {
    throw new Error("enrichment must not reach the network with the flag off");
  };
  const result = await enrichFile({
    file: { id: "f1", name: "scan.pdf", mimeType: "application/pdf" },
    env: {},
    fetchImpl: networkTouched,
  });
  assert.equal(result, null);
});

test("enrichment candidates are zero-unit, image, and exportable-unsupported files", () => {
  const candidates = selectEnrichmentCandidates([
    { id: "scanned", name: "scan.pdf", mimeType: "application/pdf", unitCount: 0 },
    { id: "normal-pdf", name: "ok.pdf", mimeType: "application/pdf", unitCount: 12 },
    { id: "photo", name: "photo.png", mimeType: "image/png", unitCount: 0 },
    { id: "drawing", name: "diagram", mimeType: "application/vnd.google-apps.drawing", unitCount: 0 },
    { id: "doc", name: "doc", mimeType: "application/vnd.google-apps.document", unitCount: 40 },
    { id: "zip", name: "archive.zip", mimeType: "application/zip", unitCount: 0 },
  ]);
  assert.deepEqual(
    candidates.map((file) => file.id),
    ["scanned", "photo", "drawing"],
  );
});

test("when enabled with an injected transport, enrichment stores ai_enriched units", async () => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Invoice 2043\nTotal due 1,200 USD" }],
      }),
    };
  };
  const units = await enrichFile({
    file: { id: "f1", name: "scan.pdf", mimeType: "application/pdf" },
    data: new TextEncoder().encode("%PDF-1.4 fake").buffer,
    env: { INDEXING_AI_ENRICHMENT: "claude", ANTHROPIC_API_KEY: "sk-test" },
    fetchImpl: fakeFetch,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.anthropic.com/v1/messages");
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.model, "claude-sonnet-5");
  assert.equal(requests[0].init.headers["x-api-key"], "sk-test");
  assert.equal(body.messages[0].content[0].type, "document");
  assert.equal(units.length, 2);
  assert.equal(units[0].unitType, "ai_enriched_text");
  assert.equal(units[0].text, "Invoice 2043");
  assert.match(units[0].contentHash, /^[0-9a-f]{64}$/);
});

test("files/min rate and ETA derive only from persisted hop snapshots", () => {
  const none = indexingRateFromHops([], 100);
  assert.deepEqual(none, {
    filesPerMinute: null,
    etaSeconds: null,
    completedHops: 0,
    lastCheckpointAt: null,
  });
  const twoHops = indexingRateFromHops(
    [
      { completedAt: "2026-07-29T00:00:00.000Z", processedCountAtCompletion: 100 },
      { completedAt: "2026-07-29T00:02:00.000Z", processedCountAtCompletion: 300 },
    ],
    500,
  );
  assert.equal(twoHops.filesPerMinute, 100);
  // Fewer than 3 hops of signal: no ETA yet.
  assert.equal(twoHops.etaSeconds, null);
  assert.equal(twoHops.lastCheckpointAt, "2026-07-29T00:02:00.000Z");
  const threeHops = indexingRateFromHops(
    [
      { completedAt: "2026-07-29T00:04:00.000Z", processedCountAtCompletion: 500 },
      { completedAt: "2026-07-29T00:00:00.000Z", processedCountAtCompletion: 100 },
      { completedAt: "2026-07-29T00:02:00.000Z", processedCountAtCompletion: 300 },
    ],
    500,
  );
  assert.equal(threeHops.filesPerMinute, 100);
  assert.equal(threeHops.etaSeconds, 300);
  assert.equal(threeHops.completedHops, 3);
  const incomplete = indexingRateFromHops(
    [
      { completedAt: null, processedCountAtCompletion: 10 },
      { completedAt: "2026-07-29T00:00:00.000Z", processedCountAtCompletion: null },
    ],
    50,
  );
  assert.equal(incomplete.filesPerMinute, null);
});

test("the staged pipeline is wired through sync, repository, jobs, and the dashboard", async () => {
  const [sync, repository, jobs, workspaces, dashboard, schema] =
    await Promise.all([
      readFile(new URL("../lib/google-drive/sync.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/google-drive/repository.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../lib/indexing/jobs.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../lib/workspaces/repository.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/workspace-dashboard.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    ]);
  // Stage 1: metadata-first bulk upserts during pagination, with a durable
  // page cursor so a limited hop resumes instead of re-listing from page 1.
  assert.match(sync, /persistDiscoveredFileMetadata/);
  assert.match(sync, /latestDiscoveryCheckpoint/);
  assert.match(sync, /nextPageToken: inventory\.nextPageToken/);
  assert.match(repository, /DB_BATCH_MAX_STATEMENTS = D1_MAX_STATEMENTS_PER_BATCH/);
  assert.match(repository, /indexStatus: "metadata"/);
  // Stage 2: duplicates refresh metadata without re-extraction.
  assert.match(sync, /refreshFileMetadataBatch/);
  // Stages 3-5: priority-ordered window sized by the remaining subrequest
  // budget (never a hardcoded 500) through the adaptive pool with per-file
  // transactional writes.
  assert.match(sync, /workWindowFromBudget\(budget/);
  assert.match(sync, /cap: WORK_WINDOW_MAX_FILES/);
  assert.match(sync, /EXTRACTION_POOL_INITIAL = 20/);
  assert.match(sync, /maxInFlightWeight: MAX_IN_FLIGHT_EXTRACTION_BYTES/);
  assert.match(sync, /sortPendingDriveFiles/);
  assert.match(sync, /runPool\(/);
  assert.match(repository, /runBatchChunks/);
  assert.match(repository, /rowsPerStatementForTable|statement-builders/);
  // Stage 6: enrichment strictly flag-gated after content indexing.
  assert.match(sync, /enrichmentEnabled\(/);
  assert.match(sync, /"ai_enriched"/);
  // Stage 8: retry pass only after the main queue drains.
  assert.match(sync, /recordFileRetryAttempts/);
  assert.match(sync, /MAX_FILE_RETRIES/);
  // Counters, hop snapshots, rate/ETA, and the progressive-search label all
  // come from persisted state.
  assert.match(jobs, /processedCountAtCompletion: result\.filesProcessed/);
  assert.match(jobs, /metadataIndexedCount/);
  assert.match(jobs, /duplicateCount: accumulatedCounter\(/);
  assert.match(jobs, /retriedCount: accumulatedCounter\(/);
  assert.match(jobs, /monotonic\(\s*indexingJobs\.processedCount/);
  assert.match(jobs, /continuationExecutionFence\(/);
  assert.match(jobs, /inArray\(indexingJobs\.id, fencedJobIds\)/);
  assert.match(workspaces, /indexingRateFromHops/);
  assert.match(workspaces, /searchIndex/);
  assert.match(dashboard, /Searchable by name \(\{data\.searchIndex\.nameSearchable\}\)/);
  assert.match(dashboard, /full-text ready \(\{data\.searchIndex\.fullTextReady\} of \{data\.searchIndex\.total\}\)/);
  assert.match(dashboard, /Last durable checkpoint/);
  assert.match(dashboard, /files\/min/);
  assert.match(dashboard, /metadataIndexedCount/);
  assert.match(dashboard, /duplicateCount/);
  assert.match(dashboard, /retriedCount/);
  // Schema: additive counters and per-file retry budget.
  for (const column of [
    "metadata_indexed_count",
    "content_indexed_count",
    "unchanged_count",
    "duplicate_count",
    "retried_count",
    "processed_count_at_completion",
  ])
    assert.match(schema, new RegExp(column));
  assert.match(schema, /retryCount: integer\("retry_count"\)\.notNull\(\)\.default\(0\)/);
  // Hard product rules: no embeddings seam enabled, enrichment off by default.
  assert.doesNotMatch(sync, /batchEmbed|INDEXING_EMBEDDINGS/);
  assert.doesNotMatch(sync, /ANTHROPIC_API_KEY/);
});

test("migration 0019 is additive and forward-only", async () => {
  const migration = await readFile(
    new URL("../drizzle/0019_shiny_ben_parker.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE `indexing_jobs` ADD `metadata_indexed_count` integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /ALTER TABLE `source_files` ADD `retry_count` integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /ALTER TABLE `indexing_continuations` ADD `processed_count_at_completion` integer/);
  assert.doesNotMatch(migration, /DROP|RENAME|DELETE/i);
});

// ---------------------------------------------------------------------------
// Regressions for the confirmed indexer-v2 defects.
// ---------------------------------------------------------------------------

test("the subrequest budget is conservative, env-configurable, and drives the work window", () => {
  assert.equal(subrequestBudgetLimit(undefined), DEFAULT_SUBREQUEST_BUDGET);
  assert.equal(subrequestBudgetLimit({}), DEFAULT_SUBREQUEST_BUDGET);
  assert.equal(subrequestBudgetLimit({ INDEXING_SUBREQUEST_BUDGET: "nope" }), 45);
  assert.equal(subrequestBudgetLimit({ INDEXING_SUBREQUEST_BUDGET: "900" }), 900);
  // Clamped into a sane range in both directions.
  assert.equal(subrequestBudgetLimit({ INDEXING_SUBREQUEST_BUDGET: "1" }), 12);
  assert.equal(subrequestBudgetLimit({ INDEXING_SUBREQUEST_BUDGET: "100000" }), 1_000);
  const budget = createSubrequestBudget({ limit: 45, reserve: 8 });
  assert.equal(budget.remaining, 45);
  assert.equal(budget.available, 37);
  // The window is DERIVED, never the hardcoded 500 that blew the limit.
  const freePlanWindow = workWindowFromBudget(budget, {
    perFile: SUBREQUESTS_PER_FILE,
    cap: 500,
  });
  assert.equal(freePlanWindow, Math.floor(37 / SUBREQUESTS_PER_FILE));
  assert.ok(freePlanWindow < 500);
  // A paid-plan budget scales the window up by an order of magnitude.
  const paid = createSubrequestBudget({ limit: 1_000, reserve: 8 });
  const paidWindow = workWindowFromBudget(paid, {
    perFile: SUBREQUESTS_PER_FILE,
    cap: 500,
  });
  assert.equal(paidWindow, Math.floor(992 / SUBREQUESTS_PER_FILE));
  assert.ok(paidWindow > freePlanWindow * 10);
  // The documented 500-file window remains a hard upper bound.
  const huge = createSubrequestBudget({ limit: 1_000, reserve: 0 });
  assert.equal(workWindowFromBudget(huge, { perFile: 1, cap: 500 }), 500);
  budget.spend(37);
  assert.equal(budget.exhausted(), true);
  assert.equal(budget.canSpend(1), false);
  assert.equal(workWindowFromBudget(budget, { perFile: SUBREQUESTS_PER_FILE }), 0);
  // Exhaustion is a state to observe, never a throw.
  budget.spend(100);
  assert.equal(budget.remaining, 0);
});

/** Synthetic Drive pagination: 1,000 files per page, no network. */
function fakeDriveFetch(pageCount, requests) {
  return async (url) => {
    const parsed = new URL(url);
    const token = parsed.searchParams.get("pageToken");
    const page = token ? Number(token.replace("page-", "")) : 0;
    requests.push(token ?? "page-0");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        files: Array.from({ length: 3 }, (_, index) => ({
          id: `p${page}-f${index}`,
          name: `File ${page}-${index}`,
          mimeType: "application/pdf",
          modifiedTime: "2026-07-01T00:00:00.000Z",
        })),
        nextPageToken: page + 1 < pageCount ? `page-${page + 1}` : undefined,
      }),
    };
  };
}

test("a budget-limited discovery hop checkpoints its cursor and the next hop resumes there", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = fakeDriveFetch(6, requests);
  try {
    const budget = createSubrequestBudget({ limit: 12, reserve: 8 });
    const first = await listAllDriveFiles("token", undefined, {
      onRequest: () => budget.spend(1),
      shouldStop: () => budget.exhausted(),
    });
    // Stopped cleanly on budget, with a resumable cursor and no throw.
    assert.equal(first.paginationComplete, false);
    assert.equal(first.stoppedEarly, true);
    assert.equal(first.resumed, false);
    assert.ok(first.nextPageToken);
    assert.ok(first.files.length > 0);
    const pagesInFirstHop = requests.length;
    assert.ok(pagesInFirstHop < 6, "budget should stop pagination early");
    // The next hop resumes AT THE SAVED TOKEN instead of re-listing page 1.
    const resumeBudget = createSubrequestBudget({ limit: 60, reserve: 8 });
    const second = await listAllDriveFiles("token", undefined, {
      pageToken: first.nextPageToken,
      discoveredBefore: first.files.length,
      onRequest: () => resumeBudget.spend(1),
      shouldStop: () => resumeBudget.exhausted(),
    });
    assert.equal(second.resumed, true);
    assert.equal(second.paginationComplete, true);
    assert.equal(requests.slice(pagesInFirstHop)[0], first.nextPageToken);
    assert.equal(requests.filter((token) => token === "page-0").length, 1);
    // Every page was listed exactly once across the two hops.
    assert.equal(new Set(requests).size, 6);
    assert.equal(first.files.length + second.files.length, 18);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resumed discovery reports cumulative progress, never a sawtooth back to zero", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeDriveFetch(4, []);
  try {
    const seen = [];
    await listAllDriveFiles("token", (progress) => {
      seen.push(progress.filesDiscovered);
    }, { pageToken: "page-2", discoveredBefore: 6 });
    assert.deepEqual(seen, [9, 12]);
    assert.ok(seen.every((value, index) => index === 0 || value > seen[index - 1]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicate classification requires content this pipeline actually persisted", () => {
  const inventory = [
    { id: "never-indexed", modifiedTime: "2026-07-20T00:00:00.000Z", md5Checksum: "md5-a" },
    { id: "really-indexed", modifiedTime: "2026-07-20T00:00:00.000Z", md5Checksum: "md5-b" },
  ];
  const plan = planSyncContinuation(inventory, [
    // A metadata/failed row whose checksum was written at discovery time: it
    // has NEVER had content extracted, so it must be re-extracted, not
    // silently classified as a duplicate and skipped forever.
    {
      sourceId: "never-indexed",
      modifiedAt: "2026-07-01T00:00:00.000Z",
      indexStatus: "failed",
      extractionMode: null,
      contentHash: "md5-a",
      retryCount: 0,
    },
    {
      sourceId: "really-indexed",
      modifiedAt: "2026-07-01T00:00:00.000Z",
      indexStatus: "indexed",
      extractionMode: "native",
      contentHash: "md5-b",
      retryCount: 0,
    },
  ]);
  assert.deepEqual(plan.duplicateFiles.map((file) => file.id), ["really-indexed"]);
  assert.deepEqual(plan.pendingFiles.map((file) => file.id), ["never-indexed"]);
  assert.equal(plan.filesDuplicate, 1);
  // Unsupported rows have no persisted content either.
  const unsupportedPlan = planSyncContinuation(
    [{ id: "scan", modifiedTime: "2026-07-20T00:00:00.000Z", md5Checksum: "md5-c" }],
    [{ sourceId: "scan", modifiedAt: "2026-07-01T00:00:00.000Z", indexStatus: "unsupported", extractionMode: "unsupported", contentHash: "md5-c", retryCount: 0 }],
  );
  assert.equal(unsupportedPlan.filesDuplicate, 0);
  assert.equal(unsupportedPlan.pendingFiles.length, 1);
});

test("unchanged means skipped since a PRIOR sync, not indexed by this run", () => {
  const inventory = Array.from({ length: 3 }, (_, index) => ({
    id: `doc-${index}`,
    modifiedTime: "2026-07-01T00:00:00.000Z",
  }));
  const previous = [
    // Settled long before this job started.
    { sourceId: "doc-0", modifiedAt: "2026-07-01T00:00:00.000Z", indexStatus: "indexed", extractionMode: "native", updatedAt: "2026-06-01T00:00:00.000Z" },
    // Settled by earlier hops of the job that is running right now.
    { sourceId: "doc-1", modifiedAt: "2026-07-01T00:00:00.000Z", indexStatus: "indexed", extractionMode: "native", updatedAt: "2026-07-29T00:05:00.000Z" },
    { sourceId: "doc-2", modifiedAt: "2026-07-01T00:00:00.000Z", indexStatus: "indexed", extractionMode: "native", updatedAt: "2026-07-29T00:06:00.000Z" },
  ];
  const plan = planSyncContinuation(inventory, previous, {
    runStartedAt: "2026-07-29T00:00:00.000Z",
  });
  assert.equal(plan.filesProcessed, 3);
  assert.equal(plan.filesUnchanged, 1);
  assert.equal(plan.filesSettledThisRun, 2);
  // Without a run start the caller gets the old total (back-compatible).
  assert.equal(planSyncContinuation(inventory, previous).filesUnchanged, 3);
});

test("the extraction pool admits by aggregate in-flight bytes, not slots alone", async () => {
  const megabyte = 1024 * 1024;
  const files = Array.from({ length: 20 }, (_, index) => ({
    id: `pdf-${index}`,
    size: String(10 * megabyte),
  }));
  let concurrent = 0;
  let peakConcurrent = 0;
  const stats = await runPool(
    files,
    async () => {
      concurrent += 1;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      return "ok";
    },
    {
      ...DEFAULT_POOL,
      weightOf: (file) => Number(file.size),
      maxInFlightWeight: MAX_IN_FLIGHT_EXTRACTION_BYTES,
    },
  );
  assert.equal(stats.completed, 20);
  // 20 slots x 10 MB would be 200 MB inside a 128 MB isolate.
  assert.ok(
    stats.peakInFlightWeight <= MAX_IN_FLIGHT_EXTRACTION_BYTES,
    `peak in-flight ${stats.peakInFlightWeight} exceeded the cap`,
  );
  assert.ok(peakConcurrent <= 3, `admitted ${peakConcurrent} large files at once`);
  assert.ok(stats.weightWaits > 0);
  // A single item heavier than the whole cap still runs, alone: no deadlock.
  const huge = await runPool(
    [{ id: "huge", size: String(400 * megabyte) }],
    async () => "ok",
    { ...DEFAULT_POOL, weightOf: (file) => Number(file.size), maxInFlightWeight: MAX_IN_FLIGHT_EXTRACTION_BYTES },
  );
  assert.equal(huge.completed, 1);
});

test("files above the per-file memory cap are identified deterministically", () => {
  const big = { id: "big", size: String(MAX_EXTRACTABLE_FILE_BYTES + 1) };
  const ok = { id: "ok", size: String(MAX_EXTRACTABLE_FILE_BYTES) };
  assert.equal(isOversizedForExtraction(big), true);
  assert.equal(isOversizedForExtraction(ok), false);
  assert.equal(isOversizedForExtraction({ id: "native" }), false);
  // The per-file cap must fit inside the aggregate cap so one file can run.
  assert.ok(MAX_EXTRACTABLE_FILE_BYTES < MAX_IN_FLIGHT_EXTRACTION_BYTES);
});

test("metadata-only rows are searchable by name and never imply content was read", () => {
  const file = (id, indexStatus, name, unitText) => ({
    id,
    workspaceId: "ws_a",
    connectorId: "c",
    sourceId: id,
    name,
    mimeType: "application/pdf",
    modifiedAt: "2026-07-01T00:00:00.000Z",
    webViewLink: null,
    indexStatus,
    extractionError: null,
    extractionMode: indexStatus === "indexed" ? "native" : null,
    structuralFallbackReason: null,
    units: unitText
      ? [{ id: `u_${id}`, unitType: "paragraph", text: unitText, structuralLocation: { page: 1 }, contentHash: `h_${id}` }]
      : [],
  });
  const files = [
    file("indexed", "indexed", "Roadmap review", "the quarterly roadmap body"),
    file("meta", "metadata", "Roadmap appendix", null),
    file("unrelated", "metadata", "Payroll notes", null),
  ];
  const result = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files,
    query: "roadmap",
    mode: "best",
    fileType: "all",
  });
  const ids = result.results.map((row) => row.id);
  // The dashboard's "Searchable by name (N)" claim is now true.
  assert.ok(ids.includes("meta"), "metadata-only row must be name-searchable");
  assert.ok(ids.includes("indexed"));
  assert.ok(!ids.includes("unrelated"));
  const metaResult = result.results.find((row) => row.id === "meta");
  assert.equal(metaResult.matchScope, "name_only");
  assert.equal(metaResult.snippet, null);
  assert.deepEqual(metaResult.citations, []);
  assert.ok(metaResult.explanation.includes("name match (content not indexed yet)"));
  const indexedResult = result.results.find((row) => row.id === "indexed");
  assert.equal(indexedResult.matchScope, "content");
  // Coverage keeps 'metadata' strictly distinct from 'indexed'.
  assert.equal(result.coverage.indexedFiles, 1);
  assert.equal(result.coverage.metadataOnlyFiles, 2);
  assert.equal(result.coverage.filesSearched, 1);
  assert.equal(result.coverage.nameOnlyFilesSearched, 2);
  assert.equal(result.coverage.snapshot.counts.indexed, 1);
  assert.ok(result.coverage.incompleteReasons.some((reason) => reason.includes("name only")));
});

test("content and phrase matching still require extracted content", () => {
  const metadataOnly = {
    id: "meta",
    workspaceId: "ws_a",
    connectorId: "c",
    sourceId: "meta",
    name: "Budget deck",
    mimeType: "application/pdf",
    modifiedAt: "2026-07-01T00:00:00.000Z",
    webViewLink: null,
    indexStatus: "metadata",
    extractionError: null,
    extractionMode: null,
    structuralFallbackReason: null,
    units: [],
  };
  // A term that only a body could contain never matches a name-only row.
  const body = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files: [metadataOnly],
    query: "amortization",
    mode: "best",
    fileType: "all",
  });
  assert.deepEqual(body.results, []);
  // An empty query must not surface unread files either.
  const blank = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files: [metadataOnly],
    query: "",
    mode: "best",
    fileType: "all",
  });
  assert.deepEqual(blank.results, []);
  // Two-term queries still require BOTH terms in the name.
  const partial = searchWorkspaceFiles({
    workspaceId: "ws_a",
    files: [metadataOnly],
    query: "budget amortization",
    mode: "best",
    fileType: "all",
  });
  assert.deepEqual(partial.results, []);
});

test("enrichment never sends a filename-only prompt and never invents content", async () => {
  let calls = 0;
  const countingFetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "invented" }] }) };
  };
  // Enabled, but no document bytes: no network call, no units, no egress.
  const withoutData = await enrichFile({
    file: { id: "img", name: "secret-acquisition-plan.png", mimeType: "image/png" },
    env: { INDEXING_AI_ENRICHMENT: "claude", ANTHROPIC_API_KEY: "sk-test" },
    fetchImpl: countingFetch,
  });
  assert.equal(withoutData, null);
  assert.equal(calls, 0);
  // An unsupported media type with bytes is also refused rather than described.
  const unsupportedMedia = await enrichFile({
    file: { id: "zip", name: "archive.zip", mimeType: "application/zip" },
    data: new TextEncoder().encode("PK").buffer,
    env: { INDEXING_AI_ENRICHMENT: "claude", ANTHROPIC_API_KEY: "sk-test" },
    fetchImpl: countingFetch,
  });
  assert.equal(unsupportedMedia, null);
  assert.equal(calls, 0);
  // Real document bytes: exactly one call, and the bytes are in the payload.
  const withData = await enrichFile({
    file: { id: "scan", name: "scan.pdf", mimeType: "application/pdf" },
    data: new TextEncoder().encode("%PDF-1.4").buffer,
    env: { INDEXING_AI_ENRICHMENT: "claude", ANTHROPIC_API_KEY: "sk-test" },
    fetchImpl: countingFetch,
  });
  assert.equal(calls, 1);
  assert.equal(withData.length, 1);
});

test("the hop wires budget exhaustion to a checkpoint and retries to real attempts", async () => {
  const sync = await readFile(
    new URL("../lib/google-drive/sync.ts", import.meta.url),
    "utf8",
  );
  // Budget exhaustion sets the resumable flag; it never throws.
  assert.match(sync, /if \(budget\.exhausted\(\)\) stoppedEarly = true;/);
  assert.match(sync, /SYNC_SUBREQUEST_BUDGET_REACHED/);
  assert.match(sync, /DISCOVERY_BUDGET_CHECKPOINT/);
  assert.doesNotMatch(sync, /throw new Error\("SUBREQUEST/);
  // The retry budget is charged inside the worker, per real attempt.
  assert.match(
    sync,
    /await recordFileRetryAttempts\(connector\.id, \[file\.id\], budget\);\s*\n\s*retried \+= 1;/,
  );
  // A partial or resumed inventory never plans, tombstones, or reconciles.
  assert.match(sync, /if \(!inventory\.paginationComplete \|\| inventory\.resumed\)/);
  // Enrichment only runs against fetched document bytes.
  assert.match(sync, /if \(!exported\?\.data\) continue;/);
  // metadataIndexedCount comes from committed rows.
  assert.match(sync, /metadataIndexed = await countConnectorSourceFiles\(connector\.id\)/);
  assert.doesNotMatch(sync, /metadataIndexed = discovered/);
});

test("no counter write in a continuation hop can lower a persisted value", async () => {
  const jobs = await readFile(
    new URL("../lib/indexing/jobs.ts", import.meta.url),
    "utf8",
  );
  // Only the two indexing_jobs writes inside a hop matter here: the in-hop
  // heartbeat and the end-of-hop completion.
  const counterWrites = [...jobs.matchAll(/\.update\(indexingJobs\)\s*\n?\s*\.?set\(\{([\s\S]*?)\n\s*\}\)/g)]
    .map((match) => match[1])
    .filter((body) => body.includes("processedCount"));
  assert.equal(counterWrites.length, 2, "expected the heartbeat and completion writes");
  // Every write of a monotonically growing counter goes through monotonic();
  // only failedCount may fall, and only on a hop that planned the inventory.
  for (const body of counterWrites)
    for (const column of [
      "processedCount",
      "discoveredCount",
      "indexedCount",
      "unsupportedCount",
      "skippedCount",
      "inaccessibleCount",
      "structuralCount",
      "fallbackCount",
      "metadataIndexedCount",
      "contentIndexedCount",
      "unchangedCount",
    ]) {
      assert.match(body, new RegExp(`${column}: monotonic\\(`), `${column} is written without a monotonic guard`);
      assert.doesNotMatch(
        body,
        new RegExp(`\\n\\s*${column}: (result|progress)\\.`),
        `${column} has a raw write that can lower the persisted value`,
      );
    }
  assert.match(jobs, /failedCount: result\.plannedInventory\s*\n\s*\? result\.filesFailed/);
  // Per-hop event counts accumulate rather than being replaced by the next
  // hop's zero, and the whole batch is fenced so it happens exactly once.
  for (const column of ["duplicateCount", "retriedCount", "oversizedCount"])
    assert.match(jobs, new RegExp(`${column}: accumulatedCounter\\(`));
  assert.match(jobs, /completeContinuation\b[\s\S]*\.where\(executionFence\)/);
});
