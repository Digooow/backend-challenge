"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmInboxRepository = void 0;
const inbox_message_1 = require("../../../domain/entities/inbox-message");
const inbox_message_schema_1 = require("../entities/inbox-message.schema");
class MikroOrmInboxRepository {
    constructor(globalEm) {
        this.globalEm = globalEm;
    }
    getEm(tx) {
        return tx ?? this.globalEm;
    }
    async findByConsumerAndMessageId(consumerName, messageId, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(inbox_message_schema_1.InboxMessageSchema, { consumerName, messageId });
        if (!entity)
            return null;
        return inbox_message_1.InboxMessage.rehydrate({
            messageId: entity.messageId,
            consumerName: entity.consumerName,
            payloadHash: entity.payloadHash,
            receivedAt: entity.receivedAt,
            processedAt: entity.processedAt,
        });
    }
    async save(message, tx) {
        const em = this.getEm(tx);
        const existing = await em.findOne(inbox_message_schema_1.InboxMessageSchema, {
            messageId: message.messageId,
            consumerName: message.consumerName
        });
        if (existing) {
            existing.processedAt = message.processedAt;
        }
        else {
            const entity = {
                messageId: message.messageId,
                consumerName: message.consumerName,
                payloadHash: message.payloadHash,
                receivedAt: message.receivedAt,
                processedAt: message.processedAt,
            };
            em.persist(em.create(inbox_message_schema_1.InboxMessageSchema, entity));
        }
    }
}
exports.MikroOrmInboxRepository = MikroOrmInboxRepository;
//# sourceMappingURL=mikro-orm-inbox.repository.js.map