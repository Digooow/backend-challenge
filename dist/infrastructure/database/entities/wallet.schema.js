"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletSchema = void 0;
const core_1 = require("@mikro-orm/core");
exports.WalletSchema = new core_1.EntitySchema({
    name: "Wallet",
    tableName: "wallets",
    properties: {
        id: { type: "uuid", primary: true },
        playerId: { type: "string", index: true },
        currency: { type: "string", length: 3 },
        balance: { type: "decimal", precision: 19, scale: 2 },
        version: { type: "integer", default: 1 },
        createdAt: { type: "datetime" },
        updatedAt: { type: "datetime" },
    },
    uniques: [
        { name: "unique_player_currency", properties: ["playerId", "currency"] },
    ],
    checks: [
        { name: "check_non_negative_balance", expression: "balance >= 0" },
    ],
});
//# sourceMappingURL=wallet.schema.js.map