import { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { FailureCode } from "../../domain/enums/failure-code";
import { MoneyProps } from "../../domain/value-objects/money";

export interface ProcessWagerInputDto {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey?: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  correlationId?: string;
}

export interface ProcessWagerOutputDto {
  transactionId: string;
  status: WagerTransactionStatus;
  balance?: MoneyProps;
  idempotentReplay: boolean;
  failureCode?: FailureCode;
}