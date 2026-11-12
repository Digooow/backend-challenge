import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { WalletSchema } from "./entities/wallet.schema";
import { WalletLedgerEntrySchema } from "./entities/wallet-ledger-entry.schema";
import { WagerTransactionSchema } from "./entities/wager-transaction.schema";
import { InboxMessageSchema } from "./entities/inbox-message.schema";
import { OutboxMessageSchema } from "./entities/outbox-message.schema";

export function getMikroOrmConfig() {
  return defineConfig({
    extensions: [Migrator],
    allowGlobalContext: true,
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5433),
    user: process.env.DB_USER ?? "jungle_user",
    password: process.env.DB_PASSWORD ?? "jungle_password",
    dbName: process.env.DB_NAME ?? "jungle_db",
    pool: {
      min: Number(process.env.DB_POOL_MIN ?? 2),
      max: Number(process.env.DB_POOL_MAX ?? 25),
    },
    entities: [
      WalletSchema,
      WalletLedgerEntrySchema,
      WagerTransactionSchema,
      InboxMessageSchema,
      OutboxMessageSchema,
    ],
    migrations: {
      path: "./dist/infrastructure/database/migrations",
      pathTs: "./src/infrastructure/database/migrations",
    },
  });
}

export default getMikroOrmConfig();
