import {
  continuationMessage,
  type IndexingContinuationResult,
  type IndexingQueueMessage,
} from "../../lib/indexing/queue-protocol.ts";
import type { QueuePort, SitePort } from "./coordinator.ts";

type SimulatedContinuation = {
  message: IndexingQueueMessage;
  status: "persisted" | "dispatched" | "worker_started" | "completed" | "failed";
  dispatchLeaseOwner: string | null;
  dispatchLeaseUntil: number;
  executionLeaseOwner: string | null;
  executionLeaseUntil: number;
  result: IndexingContinuationResult | null;
  dispatchCount: number;
  executionCount: number;
};

export class SimulatedManagedQueue implements QueuePort {
  readonly messages: IndexingQueueMessage[] = [];
  sends = 0;
  failNextSend = false;

  async send(message: IndexingQueueMessage) {
    this.sends += 1;
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("SIMULATED_QUEUE_SEND_FAILURE");
    }
    this.messages.push(structuredClone(message));
  }

  take() {
    return this.messages.shift() ?? null;
  }
}

export class SimulatedIndexingSite implements SitePort {
  readonly continuations = new Map<string, SimulatedContinuation>();
  readonly events: string[] = [];
  processed = 0;
  indexed = 0;
  failed = 0;
  skipped = 0;
  unavailable = 0;
  terminalError: string | null = null;
  executeFailure: string | null = null;
  executeTerminalFailure: string | null = null;
  rollbackNextCommit: string | null = null;
  now = Date.parse("2026-07-23T12:00:00.000Z");
  readonly discovered: number;
  readonly batchSize: number;
  readonly jobId: string;

  constructor(
    discovered: number,
    batchSize = 4,
    jobId = "job_queue_simulation",
  ) {
    this.discovered = discovered;
    this.batchSize = batchSize;
    this.jobId = jobId;
  }

  persistInitial(attemptEpoch = 1) {
    const message = continuationMessage({
      jobId: this.jobId,
      continuationId: `continuation_${this.jobId}_1`,
      sequence: 1,
      attemptEpoch,
      requestedAt: new Date(this.now).toISOString(),
    });
    this.persist(message);
    return message;
  }

  persist(message: IndexingQueueMessage) {
    if (!this.continuations.has(message.continuationId))
      this.continuations.set(message.continuationId, {
        message: structuredClone(message),
        status: "persisted",
        dispatchLeaseOwner: null,
        dispatchLeaseUntil: 0,
        executionLeaseOwner: null,
        executionLeaseUntil: 0,
        result: null,
        dispatchCount: 0,
        executionCount: 0,
      });
    this.events.push(`persisted:${message.sequence}`);
  }

  advance(ms: number) {
    this.now += ms;
  }

  async claimDue(leaseOwner: string) {
    const due: IndexingQueueMessage[] = [];
    for (const record of this.continuations.values()) {
      const staleDispatch =
        record.status === "dispatched" &&
        record.dispatchLeaseUntil <= this.now;
      if (
        (record.status === "persisted" || staleDispatch) &&
        record.dispatchLeaseUntil <= this.now
      ) {
        record.dispatchLeaseOwner = leaseOwner;
        record.dispatchLeaseUntil = this.now + 60_000;
        due.push(structuredClone(record.message));
      }
    }
    this.events.push(`reconciled:${due.length}`);
    return due;
  }

  async markDispatched(
    message: IndexingQueueMessage,
    leaseOwner?: string,
  ) {
    const record = this.required(message);
    if (
      leaseOwner &&
      record.dispatchLeaseOwner &&
      record.dispatchLeaseOwner !== leaseOwner
    )
      throw new Error("SIMULATED_DISPATCH_LEASE_MISMATCH");
    if (!["persisted", "dispatched"].includes(record.status)) return;
    record.status = "dispatched";
    record.dispatchCount += 1;
    record.dispatchLeaseOwner = null;
    record.dispatchLeaseUntil = this.now + 120_000;
    this.events.push(`dispatched:${message.sequence}`);
  }

  async releaseDispatch(
    message: IndexingQueueMessage,
    leaseOwner: string,
  ) {
    const record = this.required(message);
    if (record.dispatchLeaseOwner === leaseOwner) {
      record.dispatchLeaseOwner = null;
      record.dispatchLeaseUntil = this.now + 30_000;
    }
    this.events.push(`dispatch_failed:${message.sequence}`);
  }

  async execute(message: IndexingQueueMessage, leaseOwner: string) {
    const record = this.required(message);
    if (record.result) {
      this.events.push(`duplicate:${message.sequence}`);
      return structuredClone(record.result);
    }
    if (
      record.status === "worker_started" &&
      record.executionLeaseUntil > this.now &&
      record.executionLeaseOwner !== leaseOwner
    ) {
      const error = new Error("CONTINUATION_ALREADY_LEASED");
      Object.assign(error, { status: 409 });
      throw error;
    }
    if (this.executeFailure) {
      const code = this.executeFailure;
      this.executeFailure = null;
      throw new Error(code);
    }
    if (this.executeTerminalFailure) {
      const code = this.executeTerminalFailure;
      this.executeTerminalFailure = null;
      record.status = "failed";
      record.executionCount += 1;
      this.terminalError = code;
      record.result = {
        jobId: message.jobId,
        continuationId: message.continuationId,
        status: "reauthorization_required",
        terminal: true,
        next: null,
      };
      this.events.push(`terminal:${message.sequence}:${code}`);
      return structuredClone(record.result);
    }
    record.status = "worker_started";
    record.executionLeaseOwner = leaseOwner;
    record.executionLeaseUntil = this.now + 15 * 60_000;
    this.events.push(`worker_started:${message.sequence}`);
    // Everything below is staged and applied atomically at the commit
    // boundary, mirroring the single db.batch() in jobs.ts that persists the
    // batch, advances counters, completes this continuation, and persists the
    // next continuation. A crash at that boundary must leave no partial
    // effect: the lease claim, counters, stored result, and next continuation
    // all roll back together so a redelivery reprocesses exactly once.
    const processedNow = Math.min(
      this.batchSize,
      Math.max(0, this.discovered - this.processed),
    );
    const projectedProcessed = this.processed + processedNow;
    const terminal = projectedProcessed >= this.discovered;
    const next: IndexingQueueMessage | null = terminal
      ? null
      : continuationMessage({
          jobId: message.jobId,
          continuationId: `continuation_${message.jobId}_${message.sequence + 1}`,
          sequence: message.sequence + 1,
          attemptEpoch: message.attemptEpoch,
          requestedAt: new Date(this.now).toISOString(),
        });
    if (this.rollbackNextCommit) {
      const code = this.rollbackNextCommit;
      this.rollbackNextCommit = null;
      record.status = "persisted";
      record.executionLeaseOwner = null;
      record.executionLeaseUntil = 0;
      this.events.push(`rolled_back:${message.sequence}:${code}`);
      const error = new Error(code);
      Object.assign(error, { rolledBack: true });
      throw error;
    }
    this.processed = projectedProcessed;
    this.indexed += processedNow;
    record.executionCount += 1;
    if (next) this.persist(next);
    record.status = "completed";
    record.executionLeaseOwner = null;
    record.executionLeaseUntil = 0;
    record.result = {
      jobId: message.jobId,
      continuationId: message.continuationId,
      status: terminal ? "completed" : "queued",
      terminal,
      next,
    };
    this.events.push(`completed:${message.sequence}`);
    return structuredClone(record.result);
  }

  async deadLetter(message: IndexingQueueMessage) {
    const record = this.required(message);
    record.status = "failed";
    this.terminalError = "QUEUE_DELIVERY_EXHAUSTED";
    this.events.push(`dead_lettered:${message.sequence}`);
  }

  executionCount(sequence: number) {
    return (
      [...this.continuations.values()].find(
        (record) => record.message.sequence === sequence,
      )?.executionCount ?? 0
    );
  }

  private required(message: IndexingQueueMessage) {
    const record = this.continuations.get(message.continuationId);
    if (
      !record ||
      record.message.jobId !== message.jobId ||
      record.message.sequence !== message.sequence ||
      record.message.attemptEpoch !== message.attemptEpoch
    )
      throw new Error("SIMULATED_CONTINUATION_NOT_FOUND");
    return record;
  }
}
