"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxMessageSchema = void 0;
const core_1 = require("@mikro-orm/core");
exports.InboxMessageSchema = new core_1.EntitySchema({
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
//# sourceMappingURL=inbox-message.schema.js.map