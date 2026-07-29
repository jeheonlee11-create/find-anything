import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  isExtractableDriveMimeType,
  MAX_FILE_RETRIES,
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
  // Stage 1: metadata-first bulk upserts during pagination.
  assert.match(sync, /persistDiscoveredFileMetadata/);
  assert.match(repository, /DB_BATCH_MAX_STATEMENTS = 40/);
  assert.match(repository, /indexStatus: "metadata"/);
  // Stage 2: duplicates refresh metadata without re-extraction.
  assert.match(sync, /refreshFileMetadataBatch/);
  // Stages 3-5: priority-ordered bounded window through the adaptive pool
  // with per-file transactional writes.
  assert.match(sync, /WORK_WINDOW_FILES = 500/);
  assert.match(sync, /EXTRACTION_POOL_INITIAL = 20/);
  assert.match(sync, /sortPendingDriveFiles/);
  assert.match(sync, /runPool\(/);
  assert.match(repository, /runBatchChunks/);
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
  assert.match(jobs, /duplicateCount/);
  assert.match(jobs, /retriedCount/);
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
