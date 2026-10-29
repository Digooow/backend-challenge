import { Wallet } from "../../domain/entities/wallet";
import { WalletLedgerEntry } from "../../domain/entities/wallet-ledger-entry";

export interface WalletRepositoryPort {
  findById(id: string, tx?: unknown): Promise<Wallet | null>;
  findByPlayerAndCurrency(playerId: string, currency: string, tx?: unknown): Promise<Wallet | null>;
  save(wallet: Wallet, tx?: unknown): Promise<void>;
  saveLedgerEntry(entry: WalletLedgerEntry, tx?: unknown): Promise<void>;
  getLedgerEntries(walletId: string, limit?: number, cursor?: string, tx?: unknown): Promise<WalletLedgerEntry[]>;
}