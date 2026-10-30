"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const postgresql_1 = require("@mikro-orm/postgresql");
const migrations_1 = require("@mikro-orm/migrations");
const wallet_schema_1 = require("./entities/wallet.schema");
const wallet_ledger_entry_schema_1 = require("./entities/wallet-ledger-entry.schema");
const wager_transaction_schema_1 = require("./entities/wager-transaction.schema");
const inbox_message_schema_1 = require("./entities/inbox-message.schema");
const outbox_message_schema_1 = require("./entities/outbox-message.schema");
exports.default = (0, postgresql_1.defineConfig)({
    extensions: [migrations_1.Migrator],
    allowGlobalContext: true,
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5433),
    user: process.env.DB_USER ?? "jungle_user",
    password: process.env.DB_PASSWORD ?? "jungle_password",
    dbName: process.env.DB_NAME ?? "jungle_db",
    entities: [
        wallet_schema_1.WalletSchema,
        wallet_ledger_entry_schema_1.WalletLedgerEntrySchema,
        wager_transaction_schema_1.WagerTransactionSchema,
        inbox_message_schema_1.InboxMessageSchema,
        outbox_message_schema_1.OutboxMessageSchema,
    ],
    migrations: {
        path: "./dist/infrastructure/database/migrations",
        pathTs: "./src/infrastructure/database/migrations",
    },
});
//# sourceMappingURL=mikro-orm.config.js.map