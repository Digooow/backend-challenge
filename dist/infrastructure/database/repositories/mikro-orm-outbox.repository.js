"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmOutboxRepository = void 0;
const outbox_message_1 = require("../../../domain/entities/outbox-message");
const outbox_message_schema_1 = require("../entities/outbox-message.schema");
class MikroOrmOutboxRepository {
    constructor(globalEm) {
        this.globalEm = globalEm;
    }
    getEm(tx) {
        return tx ?? this.globalEm;
    }
    async save(message, tx) {
        const em = this.getEm(tx);
        const existing = await em.findOne(outbox_message_schema_1.OutboxMessageSchema, { id: message.id });
        if (existing) {
            existing.attempts = message.attempts;
            existing.nextAttemptAt = message.nextAttemptAt;
            existing.publishedAt = message.publishedAt;
        }
        else {
            const entity = {
                id: message.id,
                aggregateId: message.aggregateId,
                eventType: message.eventType,
                payload: message.payload,
                occurredAt: message.occurredAt,
                attempts: message.attempts,
                nextAttemptAt: message.nextAttemptAt,
                publishedAt: message.publishedAt,
            };
            em.persist(em.create(outbox_message_schema_1.OutboxMessageSchema, entity));
        }
    }
    async findPending(limit = 50, tx) {
        const em = this.getEm(tx);
        const now = new Date();
        const entities = await em.find(outbox_message_schema_1.OutboxMessageSchema, {
            publishedAt: null,
            $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
        }, { limit, orderBy: { occurredAt: "ASC" } });
        return entities.map((e) => outbox_message_1.OutboxMessage.rehydrate({
            id: e.id,
            aggregateId: e.aggregateId,
            eventType: e.eventType,
            payload: e.payload,
            occurredAt: e.occurredAt,
            attempts: e.attempts,
            nextAttemptAt: e.nextAttemptAt,
            publishedAt: e.publishedAt,
        }));
    }
}
exports.MikroOrmOutboxRepository = MikroOrmOutboxRepository;
//# sourceMappingURL=mikro-orm-outbox.repository.js.map