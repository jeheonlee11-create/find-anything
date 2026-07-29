export type PoolSignal = "rate_limit" | "server_error" | "timeout";

const RATE_LIMIT_PATTERN = /(_429|RATE_?LIMIT)/i;
const SERVER_ERROR_PATTERN = /_(5\d{2})(_|\b)/;
const TIMEOUT_PATTERN = /TIME_?OUT|TIMED_OUT|DEADLINE/i;

export function classifyPoolSignal(value: unknown): PoolSignal | null {
  const text =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : value && typeof value === "object" && "signal" in value
          ? String((value as { signal: unknown }).signal)
          : "";
  if (!text) return null;
  if (text === "rate_limit" || RATE_LIMIT_PATTERN.test(text)) return "rate_limit";
  if (text === "server_error" || SERVER_ERROR_PATTERN.test(text)) return "server_error";
  if (text === "timeout" || TIMEOUT_PATTERN.test(text)) return "timeout";
  return null;
}

export interface AdaptivePoolOptions<T, R> {
  initial?: number;
  min?: number;
  max?: number;
  growStep?: number;
  /** Clean completions required before the pool grows by growStep. */
  growAfter?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  /** Injected clock (defaults to Date.now) so tests are deterministic. */
  now?: () => number;
  /** Injected jitter source in [0,1) (defaults to Math.random). */
  rng?: () => number;
  /** Injected sleep (defaults to setTimeout) so tests can run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /** Stop scheduling new items when true (already-running items finish). */
  shouldStop?: () => boolean;
  /** Classify a worker result as a backoff signal; throws are classified too. */
  signalOf?: (result: R) => PoolSignal | null;
  onSignal?: (signal: PoolSignal, concurrency: number) => void;
  /**
   * Bytes (or any additive cost) an item holds in memory while it runs. A
   * concurrency cap alone does not bound memory: 20 slots × a 50 MB export is
   * 1 GB inside a 128 MB isolate.
   */
  weightOf?: (item: T, index: number) => number;
  /** Aggregate in-flight weight the pool may admit at once. */
  maxInFlightWeight?: number;
}

export interface AdaptivePoolStats {
  started: number;
  completed: number;
  failed: number;
  backoffs: number;
  finalConcurrency: number;
  peakConcurrency: number;
  concurrencyLog: number[];
  /** Highest aggregate in-flight weight admitted at any instant. */
  peakInFlightWeight: number;
  /** Times admission was withheld because the weight cap was reached. */
  weightWaits: number;
  elapsedMs: number;
}

export async function runPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: AdaptivePoolOptions<T, R> = {},
): Promise<AdaptivePoolStats> {
  const max = Math.max(1, options.max ?? 20),
    min = Math.max(1, Math.min(options.min ?? 2, max)),
    growStep = Math.max(1, options.growStep ?? 2),
    growAfter = Math.max(1, options.growAfter ?? 10),
    baseBackoffMs = options.baseBackoffMs ?? 250,
    maxBackoffMs = options.maxBackoffMs ?? 4_000,
    now = options.now ?? Date.now,
    rng = options.rng ?? Math.random,
    sleep =
      options.sleep ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    shouldStop = options.shouldStop ?? (() => false),
    signalOf = options.signalOf ?? (() => null),
    weightOf = options.weightOf ?? (() => 0),
    maxInFlightWeight = Math.max(
      0,
      options.maxInFlightWeight ?? Number.MAX_SAFE_INTEGER,
    );
  let concurrency = Math.min(max, Math.max(min, options.initial ?? max)),
    cleanStreak = 0,
    consecutiveSignals = 0,
    nextIndex = 0,
    inFlight = 0,
    inFlightWeight = 0,
    backoffUntilPromise: Promise<void> | null = null;
  const startedAt = now();
  const stats: AdaptivePoolStats = {
    started: 0,
    completed: 0,
    failed: 0,
    backoffs: 0,
    finalConcurrency: concurrency,
    peakConcurrency: concurrency,
    concurrencyLog: [concurrency],
    peakInFlightWeight: 0,
    weightWaits: 0,
    elapsedMs: 0,
  };
  const recordConcurrency = () => {
    if (stats.concurrencyLog[stats.concurrencyLog.length - 1] !== concurrency)
      stats.concurrencyLog.push(concurrency);
    stats.peakConcurrency = Math.max(stats.peakConcurrency, concurrency);
  };
  const applySignal = (signal: PoolSignal) => {
    cleanStreak = 0;
    consecutiveSignals += 1;
    stats.backoffs += 1;
    concurrency = Math.max(min, Math.floor(concurrency / 2));
    recordConcurrency();
    options.onSignal?.(signal, concurrency);
    const backoff = Math.min(
      maxBackoffMs,
      baseBackoffMs * 2 ** Math.min(consecutiveSignals - 1, 4),
    );
    const jittered = Math.round(backoff * (0.5 + rng() * 0.5));
    backoffUntilPromise = sleep(jittered).then(() => {
      backoffUntilPromise = null;
    });
  };
  const applyClean = () => {
    consecutiveSignals = 0;
    cleanStreak += 1;
    if (cleanStreak >= growAfter && concurrency < max) {
      cleanStreak = 0;
      concurrency = Math.min(max, concurrency + growStep);
      recordConcurrency();
    }
  };
  return new Promise<AdaptivePoolStats>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      stats.finalConcurrency = concurrency;
      stats.elapsedMs = now() - startedAt;
      resolve(stats);
    };
    const schedule = () => {
      if (settled) return;
      if (backoffUntilPromise) {
        void backoffUntilPromise.then(schedule);
        if (inFlight === 0 && (nextIndex >= items.length || shouldStop())) finish();
        return;
      }
      while (
        inFlight < concurrency &&
        nextIndex < items.length &&
        !shouldStop()
      ) {
        const index = nextIndex,
          weight = Math.max(0, weightOf(items[index], index));
        // Admit by aggregate in-flight weight as well as by slot count. An
        // item heavier than the whole cap only runs alone, so the pool can
        // never deadlock on it.
        if (inFlight > 0 && inFlightWeight + weight > maxInFlightWeight) {
          stats.weightWaits += 1;
          break;
        }
        nextIndex += 1;
        inFlight += 1;
        inFlightWeight += weight;
        stats.peakInFlightWeight = Math.max(
          stats.peakInFlightWeight,
          inFlightWeight,
        );
        stats.started += 1;
        const release = () => {
          inFlight -= 1;
          inFlightWeight = Math.max(0, inFlightWeight - weight);
        };
        worker(items[index], index).then(
          (result) => {
            release();
            stats.completed += 1;
            const signal = signalOf(result);
            if (signal) applySignal(signal);
            else applyClean();
            schedule();
          },
          (error: unknown) => {
            release();
            stats.completed += 1;
            stats.failed += 1;
            const signal = classifyPoolSignal(error);
            if (signal) applySignal(signal);
            else applyClean();
            schedule();
          },
        );
      }
      if (inFlight === 0 && (nextIndex >= items.length || shouldStop())) finish();
    };
    try {
      schedule();
    } catch (error) {
      settled = true;
      reject(error);
    }
  });
}
