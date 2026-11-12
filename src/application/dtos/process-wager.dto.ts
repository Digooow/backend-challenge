import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { FailureCode } from "../../domain/enums/failure-code";
import { MoneyProps } from "../../domain/value-objects/money";
import { MoneyRequestDto } from "./create-wallet.dto";

export class ProcessWagerRequestDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsString()
  @IsIn([
    WagerTransactionKind.Bet,
    WagerTransactionKind.Win,
    WagerTransactionKind.Loss,
    WagerTransactionKind.Refund,
    WagerTransactionKind.Rollback,
  ])
  kind!: WagerTransactionKind;

  @IsObject()
  @ValidateNested()
  @Type(() => MoneyRequestDto)
  money!: MoneyRequestDto;

  @ValidateIf(
    (o) =>
      o.kind === WagerTransactionKind.Refund ||
      o.kind === WagerTransactionKind.Rollback ||
      o.referenceExternalTransactionId !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  referenceExternalTransactionId?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;
}

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