import { EntitySchema } from "@mikro-orm/core";
export interface InboxMessageEntity {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt: Date;
    processedAt?: Date;
}
export declare const InboxMessageSchema: EntitySchema<InboxMessageEntity, never, import("@mikro-orm/core").EntityCtor<InboxMessageEntity>>;
