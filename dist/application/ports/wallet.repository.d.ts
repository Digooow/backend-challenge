import { Wallet } from "../../domain/entities/wallet";
import { WalletLedgerEntry } from "../../domain/entities/wallet-ledger-entry";
export interface WalletRepositoryPort {
    findById(id: string, tx?: any): Promise<Wallet | null>;
    findByIdForUpdate(id: string, tx?: any): Promise<Wallet | null>;
    findByPlayerAndCurrency(playerId: string, currency: string, tx?: any): Promise<Wallet | null>;
    save(wallet: Wallet, tx?: any): Promise<void>;
    saveLedgerEntry(entry: WalletLedgerEntry, tx?: any): Promise<void>;
    getLedgerEntries(walletId: string, limit?: number, cursor?: string, tx?: any): Promise<WalletLedgerEntry[]>;
}
