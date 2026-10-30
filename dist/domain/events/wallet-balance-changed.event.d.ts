import { IntegrationEvent, EventContext } from "./integration-event";
import { Wallet } from "../entities/wallet";
import { WalletLedgerEntry } from "../entities/wallet-ledger-entry";
import { LedgerDirection } from "../enums/ledger-direction";
import { MoneyProps } from "../value-objects/money";
export interface WalletBalanceChangedData {
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: MoneyProps;
    balanceBefore: MoneyProps;
    balanceAfter: MoneyProps;
    walletVersion: number;
}
export declare class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
    readonly eventType = "WalletBalanceChanged";
    readonly version = 1;
    static from(wallet: Wallet, entry: WalletLedgerEntry, ctx: EventContext): WalletBalanceChanged;
}
