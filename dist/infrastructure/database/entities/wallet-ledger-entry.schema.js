"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletLedgerEntrySchema = void 0;
const core_1 = require("@mikro-orm/core");
const ledger_direction_1 = require("../../../domain/enums/ledger-direction");
exports.WalletLedgerEntrySchema = new core_1.EntitySchema({
    name: "WalletLedgerEntry",
    tableName: "wallet_ledger_entries",
    properties: {
        id: { type: "uuid", primary: true },
        walletId: { type: "uuid", index: true },
        transactionId: { type: "uuid", index: true },
        direction: { type: "enum", enum: true, items: () => ledger_direction_1.LedgerDirection },
        amount: { type: "decimal", precision: 19, scale: 2 },
        currency: { type: "string", length: 3 },
        balanceBefore: { type: "decimal", precision: 19, scale: 2 },
        balanceAfter: { type: "decimal", precision: 19, scale: 2 },
        createdAt: { type: "datetime" },
    },
});
//# sourceMappingURL=wallet-ledger-entry.schema.js.map