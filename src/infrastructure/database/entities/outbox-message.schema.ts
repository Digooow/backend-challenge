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

export const OutboxMessageSchema = new EntitySchema<OutboxMessageEntity>({
  name: "OutboxMessage",
  tableName: "outbox_messages",
  properties: {
    id: { type: "uuid", primary: true },
    aggregateId: { type: "string", index: true },
    eventType: { type: "string" },
    payload: { type: "json" },
    occurredAt: { type: "datetime" },
    attempts: { type: "integer", default: 0 },
    nextAttemptAt: { type: "datetime", nullable: true, index: true },
    publishedAt: { type: "datetime", nullable: true, index: true },
  },
});