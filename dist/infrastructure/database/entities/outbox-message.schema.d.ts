import { EntitySchema } from "@mikro-orm/core";
export interface OutboxMessageEntity {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
    attempts: number;
    nextAttemptAt?: Date;
    publishedAt?: Date;
}
export declare const OutboxMessageSchema: EntitySchema<OutboxMessageEntity, never, import("@mikro-orm/core").EntityCtor<OutboxMessageEntity>>;
