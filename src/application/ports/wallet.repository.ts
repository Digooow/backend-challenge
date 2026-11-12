import { Wallet } from "../../domain/entities/wallet";
import { WalletLedgerEntry } from "../../domain/entities/wallet-ledger-entry";
import { Money } from "../../domain/value-objects/money";

export interface LedgerSummaryResult {
  calculatedBalance: Money;
  checkedEntries: number;
}

export interface WalletRepositoryPort {
  findById(id: string, tx?: any): Promise<Wallet | null>;
  findByIdForUpdate(id: string, tx?: any): Promise<Wallet | null>;
  findByPlayerAndCurrency(playerId: string, currency: string, tx?: any): Promise<Wallet | null>;
  save(wallet: Wallet, tx?: any): Promise<void>;
  saveLedgerEntry(entry: WalletLedgerEntry, tx?: any): Promise<void>;
  getLedgerEntries(walletId: string, limit?: number, cursor?: string, tx?: any): Promise<WalletLedgerEntry[]>;
  findLedgerEntryByTransactionId?(walletId: string, transactionId: string, tx?: any): Promise<WalletLedgerEntry | null>;
  calculateLedgerSummary?(walletId: string, currency: string, tx?: any): Promise<LedgerSummaryResult>;
}

export function encodeLedgerCursor(entry: Pick<WalletLedgerEntry, "createdAt" | "id">): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: entry.createdAt.toISOString(),
      id: entry.id,
    }),
    "utf8",
  ).toString("base64url");
}