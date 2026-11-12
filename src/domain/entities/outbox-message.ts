import { IntegrationEvent } from "../events/integration-event";

export interface OutboxMessageState {
  id: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  attempts: number;
  nextAttemptAt?: Date | null;
  publishedAt?: Date | null;
}

export class OutboxMessage {
  public static readonly MAX_ATTEMPTS = 10;

  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Record<string, unknown>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(event: IntegrationEvent<unknown>): OutboxMessage {
    return new OutboxMessage(
      event.eventId,
      event.aggregateId,
      event.eventType,
      event.toJSON() as Record<string, unknown>,
      event.occurredAt,
      0,
    );
  }

  static rehydrate(state: OutboxMessageState): OutboxMessage {
    return new OutboxMessage(
      state.id,
      state.aggregateId,
      state.eventType,
      state.payload,
      state.occurredAt,
      state.attempts,
      state.nextAttemptAt ?? undefined,
      state.publishedAt ?? undefined,
    );
  }

  get attempts(): number {
    return this._attempts;
  }

  get nextAttemptAt(): Date | undefined {
    return this._nextAttemptAt;
  }

  get publishedAt(): Date | undefined {
    return this._publishedAt;
  }

  isPending(): boolean {
    return this._publishedAt == null;
  }

  hasExceededMaxAttempts(maxAttempts: number = OutboxMessage.MAX_ATTEMPTS): boolean {
    return this._attempts >= maxAttempts;
  }

  isDue(now: Date = new Date()): boolean {
    if (!this.isPending() || this.hasExceededMaxAttempts()) return false;
    if (!this._nextAttemptAt) return true;
    return this._nextAttemptAt <= now;
  }

  markPublished(at: Date = new Date()): void {
    this._publishedAt = at;
  }

  scheduleRetry(now: Date = new Date()): void {
    this._attempts += 1;
    const backoffSeconds = Math.min(Math.pow(2, this._attempts), 300);
    this._nextAttemptAt = new Date(now.getTime() + backoffSeconds * 1000);
  }
}