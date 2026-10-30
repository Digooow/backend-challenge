import { EntitySchema } from "@mikro-orm/core";
import { WagerTransactionKind } from "../../../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../../domain/enums/wager-transaction-status";
import { FailureCode } from "../../../domain/enums/failure-code";
export interface WagerTransactionEntity {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    amount: string;
    currency: string;
    referenceExternalTransactionId?: string;
    createdAt: Date;
    status: WagerTransactionStatus;
    referenceTransactionId?: string;
    failureCode?: FailureCode;
    processedAt?: Date;
}
export declare const WagerTransactionSchema: EntitySchema<WagerTransactionEntity, never, import("@mikro-orm/core").EntityCtor<WagerTransactionEntity>>;
