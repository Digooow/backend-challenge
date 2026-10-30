export interface EventContext {
    correlationId: string;
    causationId?: string;
}
export interface IntegrationEventProps<T> {
    eventId?: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt?: Date;
    data: T;
}
export declare abstract class IntegrationEvent<T> {
    abstract readonly eventType: string;
    abstract readonly version: number;
    readonly eventId: string;
    readonly aggregateId: string;
    readonly correlationId: string;
    readonly causationId?: string;
    readonly occurredAt: Date;
    readonly data: Readonly<T>;
    protected constructor(props: IntegrationEventProps<T>);
    toJSON(): {
        eventId: string;
        eventType: string;
        aggregateId: string;
        correlationId: string;
        causationId: string | undefined;
        occurredAt: string;
        version: number;
        data: Readonly<T>;
    };
}
