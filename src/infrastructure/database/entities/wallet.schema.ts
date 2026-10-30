import { EntitySchema } from "@mikro-orm/core";

export interface WalletEntity {
  id: string;
  playerId: string;
  currency: string;
  balance: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const WalletSchema = new EntitySchema<WalletEntity>({
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