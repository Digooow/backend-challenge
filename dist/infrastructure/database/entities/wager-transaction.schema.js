"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WagerTransactionSchema = void 0;
const core_1 = require("@mikro-orm/core");
const wager_transaction_kind_1 = require("../../../domain/enums/wager-transaction-kind");
const wager_transaction_status_1 = require("../../../domain/enums/wager-transaction-status");
const failure_code_1 = require("../../../domain/enums/failure-code");
exports.WagerTransactionSchema = new core_1.EntitySchema({
    name: "WagerTransaction",
    tableName: "wager_transactions",
    properties: {
        id: { type: "uuid", primary: true },
        providerId: { type: "string" },
        externalTransactionId: { type: "string" },
        idempotencyKey: { type: "string" },
        payloadHash: { type: "string" },
        walletId: { type: "uuid", index: true },
        playerId: { type: "string", index: true },
        roundId: { type: "string" },
        gameId: { type: "string" },
        kind: { type: "enum", enum: true, items: () => wager_transaction_kind_1.WagerTransactionKind },
        amount: { type: "decimal", precision: 19, scale: 2 },
        currency: { type: "string", length: 3 },
        referenceExternalTransactionId: { type: "string", nullable: true },
        createdAt: { type: "datetime" },
        status: { type: "enum", enum: true, items: () => wager_transaction_status_1.WagerTransactionStatus },
        referenceTransactionId: { type: "uuid", nullable: true },
        failureCode: { type: "enum", enum: true, items: () => failure_code_1.FailureCode, nullable: true },
        processedAt: { type: "datetime", nullable: true },
    },
    uniques: [
        { name: "unique_idempotency_key", properties: ["idempotencyKey"] },
        { name: "unique_provider_external_id", properties: ["providerId", "externalTransactionId"] },
    ],
});
//# sourceMappingURL=wager-transaction.schema.js.map