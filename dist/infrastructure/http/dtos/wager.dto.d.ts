import { WagerTransactionKind } from '../../../domain/enums/wager-transaction-kind';
declare class MoneyDto {
    amount: string;
    currency: string;
}
export declare class ProcessWagerRequestDto {
    providerId: string;
    externalTransactionId: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: MoneyDto;
    referenceExternalTransactionId?: string;
}
export {};
