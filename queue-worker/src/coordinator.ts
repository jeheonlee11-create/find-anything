import type {
  IndexingContinuationResult,
  IndexingQueueMessage,
} from "../../lib/indexing/queue-protocol.ts";

export type QueuePort = {
  send(message: IndexingQueueMessage): Promise<void>;
};

export type SitePort = {
  claimDue(leaseOwner: string): Promise<IndexingQueueMessage[]>;
  markDispatched(
    message: IndexingQueueMessage,
    leaseOwner?: string,
  ): Promise<void>;
  releaseDispatch(
    message: IndexingQueueMessage,
    leaseOwner: string,
  ): Promise<void>;
  execute(
    message: IndexingQueueMessage,
    leaseOwner: string,
  ): Promise<IndexingContinuationResult>;
  deadLetter(message: IndexingQueueMessage): Promise<void>;
};

export class IndexingQueueCoordinator {
  private readonly queue: QueuePort;
  private readonly site: SitePort;
  private readonly randomId: () => string;

  constructor(
    queue: QueuePort,
    site: SitePort,
    randomId: () => string = () => crypto.randomUUID(),
  ) {
    this.queue = queue;
    this.site = site;
    this.randomId = randomId;
  }

  async enqueue(message: IndexingQueueMessage) {
    await this.queue.send(message);
    await this.site.markDispatched(message);
  }

  async reconcile() {
    const leaseOwner = `reconciler_${this.randomId()}`,
      messages = await this.site.claimDue(leaseOwner);
    let dispatched = 0;
    for (const message of messages) {
      try {
        await this.queue.send(message);
        await this.site.markDispatched(message, leaseOwner);
        dispatched += 1;
      } catch {
        await this.site.releaseDispatch(message, leaseOwner);
      }
    }
    return { found: messages.length, dispatched };
  }

  async consume(message: IndexingQueueMessage) {
    const leaseOwner = `consumer_${this.randomId()}`,
      result = await this.site.execute(message, leaseOwner);
    if (result.next) {
      await this.queue.send(result.next);
      await this.site.markDispatched(result.next);
    }
    return result;
  }

  async consumeDeadLetter(message: IndexingQueueMessage) {
    await this.site.deadLetter(message);
  }
}
