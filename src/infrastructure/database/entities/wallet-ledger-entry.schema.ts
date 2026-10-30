import { EntitySchema } from "@mikro-orm/core";
import { LedgerDirection } from "../../../domain/enums/ledger-direction";

export interface WalletLedgerEntryEntity {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  amount: string;
  currency: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: Date;
}

export const WalletLedgerEntrySchema = new EntitySchema<WalletLedgerEntryEntity>({
  name: "WalletLedgerEntry",
  tableName: "wallet_ledger_entries",
  properties: {
    id: { type: "uuid", primary: true },
    walletId: { type: "uuid", index: true },
    transactionId: { type: "uuid", index: true },
    direction: { type: "enum", enum: true, items: () => LedgerDirection },
    amount: { type: "decimal", precision: 19, scale: 2 },
    currency: { type: "string", length: 3 },
    balanceBefore: { type: "decimal", precision: 19, scale: 2 },
    balanceAfter: { type: "decimal", precision: 19, scale: 2 },
    createdAt: { type: "datetime" },
  },
});