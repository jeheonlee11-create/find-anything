/**
 * Cloudflare Workers subrequest budget for one indexing continuation hop.
 *
 * A Worker invocation may issue at most 50 subrequests on the free plan and
 * 1000 on paid plans. EVERY outbound Drive fetch and EVERY D1 batch counts.
 * A hop that blows the limit throws mid-flight, loses its unwritten progress,
 * and — because discovery restarted at page 1 on each attempt — retried into
 * the identical crash until the message dead-lettered.
 *
 * So the hop carries an explicit counter instead of a hardcoded work window:
 * work is only scheduled while the budget can still pay for it, and running
 * out is a normal, durable checkpoint (save the cursor, schedule the next
 * continuation) rather than a thrown hop. Fail-safe, never fail-stuck.
 */
export interface SubrequestBudgetEnv {
  INDEXING_SUBREQUEST_BUDGET?: string;
}

/** Conservative default: assume the free plan's 50 with headroom. */
export const DEFAULT_SUBREQUEST_BUDGET = 45;
export const MIN_SUBREQUEST_BUDGET = 12;
export const MAX_SUBREQUEST_BUDGET = 1_000;
/**
 * Held back so a budget-exhausted hop can always still pay for its closing
 * writes: final checkpoint, finishSync, connector status, and the completion
 * batch that persists the next continuation.
 */
export const SUBREQUEST_CLOSING_RESERVE = 8;
/**
 * Worst-case subrequests one file costs: the durable in-progress marker, a
 * structured fetch, an export fetch, and the persist batch.
 */
export const SUBREQUESTS_PER_FILE = 4;

export function subrequestBudgetLimit(env?: SubrequestBudgetEnv) {
  const configured = Number(env?.INDEXING_SUBREQUEST_BUDGET);
  if (!Number.isFinite(configured) || configured <= 0)
    return DEFAULT_SUBREQUEST_BUDGET;
  return Math.min(
    MAX_SUBREQUEST_BUDGET,
    Math.max(MIN_SUBREQUEST_BUDGET, Math.floor(configured)),
  );
}

export interface SubrequestBudget {
  readonly limit: number;
  readonly reserve: number;
  readonly spent: number;
  /** Subrequests left before the platform limit. */
  readonly remaining: number;
  /** Subrequests left for new work, i.e. remaining minus the closing reserve. */
  readonly available: number;
  spend(count?: number): void;
  canSpend(count?: number): boolean;
  /** True once only the closing reserve is left: stop scheduling new work. */
  exhausted(): boolean;
}

export function createSubrequestBudget(options: {
  limit?: number;
  reserve?: number;
  env?: SubrequestBudgetEnv;
} = {}): SubrequestBudget {
  const limit = Math.max(1, options.limit ?? subrequestBudgetLimit(options.env)),
    reserve = Math.max(0, Math.min(options.reserve ?? SUBREQUEST_CLOSING_RESERVE, limit - 1));
  let spent = 0;
  return {
    limit,
    reserve,
    get spent() {
      return spent;
    },
    get remaining() {
      return Math.max(0, limit - spent);
    },
    get available() {
      return Math.max(0, limit - spent - reserve);
    },
    spend(count = 1) {
      spent += Math.max(0, count);
    },
    canSpend(count = 1) {
      return limit - spent - reserve >= Math.max(0, count);
    },
    exhausted() {
      return limit - spent - reserve <= 0;
    },
  };
}

/**
 * How many files this hop may claim, derived from what the budget can still
 * pay for. Never a hardcoded window.
 */
export function workWindowFromBudget(
  budget: Pick<SubrequestBudget, "available">,
  options: { perFile?: number; cap?: number } = {},
) {
  const perFile = Math.max(1, options.perFile ?? SUBREQUESTS_PER_FILE),
    cap = Math.max(0, options.cap ?? Number.MAX_SAFE_INTEGER);
  return Math.max(0, Math.min(cap, Math.floor(budget.available / perFile)));
}
