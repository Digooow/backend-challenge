import { LedgerDirection } from "../enums/ledger-direction";
import { Money } from "../value-objects/money";
export { LedgerDirection };
export interface CreateLedgerEntryProps {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt?: Date;
}
export interface LedgerEntryState {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
}
export declare class WalletLedgerEntry {
    readonly id: string;
    readonly walletId: string;
    readonly transactionId: string;
    readonly direction: LedgerDirection;
    readonly money: Money;
    readonly balanceBefore: Money;
    readonly balanceAfter: Money;
    readonly createdAt: Date;
    private constructor();
    static create(props: CreateLedgerEntryProps): WalletLedgerEntry;
    static rehydrate(state: LedgerEntryState): WalletLedgerEntry;
    isBalanced(): boolean;
}
