import { IntegrationEvent } from "../events/integration-event";
export interface OutboxMessageState {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
    attempts: number;
    nextAttemptAt?: Date;
    publishedAt?: Date;
}
export declare class OutboxMessage {
    readonly id: string;
    readonly aggregateId: string;
    readonly eventType: string;
    readonly payload: Record<string, unknown>;
    readonly occurredAt: Date;
    private _attempts;
    private _nextAttemptAt?;
    private _publishedAt?;
    private constructor();
    static enqueue(event: IntegrationEvent<unknown>): OutboxMessage;
    static rehydrate(state: OutboxMessageState): OutboxMessage;
    get attempts(): number;
    get nextAttemptAt(): Date | undefined;
    get publishedAt(): Date | undefined;
    isPending(): boolean;
    isDue(now?: Date): boolean;
    markPublished(at?: Date): void;
    scheduleRetry(now?: Date): void;
}
