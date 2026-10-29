import { EntitySchema } from "@mikro-orm/core";

export interface InboxMessageEntity {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
}

export const InboxMessageSchema = new EntitySchema<InboxMessageEntity>({
  name: "InboxMessage",
  tableName: "inbox_messages",
  properties: {
    messageId: { type: "string", primary: true },
    consumerName: { type: "string", primary: true },
    payloadHash: { type: "string" },
    receivedAt: { type: "datetime" },
    processedAt: { type: "datetime", nullable: true },
  },
});