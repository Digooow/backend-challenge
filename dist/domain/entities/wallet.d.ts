import { Money } from "../value-objects/money";
import { WalletLedgerEntry } from "./wallet-ledger-entry";
export interface OpenWalletProps {
    id: string;
    playerId: string;
    initialBalance: Money;
    createdAt?: Date;
}
export interface WalletState {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface WalletOperationResult {
    ledgerEntry: WalletLedgerEntry;
}
export declare class Wallet {
    readonly id: string;
    readonly playerId: string;
    readonly currency: string;
    private _balance;
    private _version;
    readonly createdAt: Date;
    private _updatedAt;
    private constructor();
    static open(props: OpenWalletProps): {
        wallet: Wallet;
        openingLedgerEntry?: WalletLedgerEntry;
    };
    static rehydrate(state: WalletState): Wallet;
    get balance(): Money;
    get version(): number;
    get updatedAt(): Date;
    debit(amount: Money, transactionId: string, ledgerEntryId?: string): WalletOperationResult;
    credit(amount: Money, transactionId: string, ledgerEntryId?: string): WalletOperationResult;
    private assertSameCurrency;
}
