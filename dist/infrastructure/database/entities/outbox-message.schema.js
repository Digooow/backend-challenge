"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxMessageSchema = void 0;
const core_1 = require("@mikro-orm/core");
exports.OutboxMessageSchema = new core_1.EntitySchema({
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
//# sourceMappingURL=outbox-message.schema.js.map