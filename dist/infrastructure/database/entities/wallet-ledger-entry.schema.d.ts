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
export declare const WalletLedgerEntrySchema: EntitySchema<WalletLedgerEntryEntity, never, import("@mikro-orm/core").EntityCtor<WalletLedgerEntryEntity>>;
