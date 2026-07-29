import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPoolSignal,
  runPool,
} from "../lib/indexing/adaptive-pool.ts";

const instantClock = () => {
  let tick = 0;
  return () => {
    tick += 1;
    return tick;
  };
};

test("rate-limit signals halve concurrency to the floor and clean windows regrow it", async () => {
  const items = Array.from({ length: 24 }, (_, index) => index),
    sleeps = [];
  const stats = await runPool(
    items,
    async (item) => ({ signal: item < 3 ? "rate_limit" : null }),
    {
      initial: 8,
      min: 2,
      max: 8,
      growStep: 2,
      growAfter: 2,
      now: instantClock(),
      rng: () => 0.5,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      signalOf: (result) => result.signal,
    },
  );
  assert.equal(stats.started, items.length);
  assert.equal(stats.completed, items.length);
  assert.equal(stats.backoffs, 3);
  // 8 → 4 → 2 (floor) on the three signals, then +2 per clean window of 2.
  assert.deepEqual(stats.concurrencyLog, [8, 4, 2, 4, 6, 8]);
  assert.equal(stats.finalConcurrency, 8);
  // Deterministic jittered exponential backoff with rng() = 0.5.
  assert.deepEqual(sleeps, [188, 375, 750]);
});

test("worker throws are classified as signals and never reject the pool", async () => {
  const stats = await runPool(
    [0, 1, 2, 3, 4, 5],
    async (item) => {
      if (item === 0) throw new Error("GOOGLE_DRIVE_HTTP_429");
      if (item === 1) throw new Error("GOOGLE_DOCS_HTTP_503");
      return "ok";
    },
    {
      initial: 2,
      min: 2,
      max: 4,
      growAfter: 2,
      now: instantClock(),
      rng: () => 0,
      sleep: () => Promise.resolve(),
    },
  );
  assert.equal(stats.completed, 6);
  assert.equal(stats.failed, 2);
  assert.equal(stats.backoffs, 2);
});

test("shouldStop halts scheduling but lets in-flight work finish", async () => {
  let completions = 0;
  const stats = await runPool(
    Array.from({ length: 50 }, (_, index) => index),
    async () => {
      completions += 1;
    },
    {
      initial: 1,
      min: 1,
      max: 1,
      shouldStop: () => completions >= 5,
      now: instantClock(),
      rng: () => 0,
      sleep: () => Promise.resolve(),
    },
  );
  assert.equal(stats.started, 5);
  assert.equal(completions, 5);
});

test("signals map from the sanitized Google error codes", () => {
  assert.equal(classifyPoolSignal("GOOGLE_DRIVE_HTTP_429"), "rate_limit");
  assert.equal(classifyPoolSignal(new Error("GOOGLE_DOCS_HTTP_503")), "server_error");
  assert.equal(classifyPoolSignal("GOOGLE_SHEETS_HTTP_500"), "server_error");
  assert.equal(classifyPoolSignal("GOOGLE_TOKEN_REFRESH_TIMEOUT"), "timeout");
  assert.equal(classifyPoolSignal("GOOGLE_DOCS_HTTP_403"), null);
  assert.equal(classifyPoolSignal("SOURCE_NO_LONGER_AUTHORIZED"), null);
  assert.equal(classifyPoolSignal(undefined), null);
});

test("an empty item list resolves immediately", async () => {
  const stats = await runPool([], async () => {}, {
    now: instantClock(),
    rng: () => 0,
    sleep: () => Promise.resolve(),
  });
  assert.equal(stats.started, 0);
  assert.equal(stats.completed, 0);
});
