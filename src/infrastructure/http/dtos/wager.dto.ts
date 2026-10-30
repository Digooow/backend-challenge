import { IsString, IsNotEmpty, IsEnum, ValidateNested, IsDefined, Matches, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { WagerTransactionKind } from '../../../domain/enums/wager-transaction-kind';

class MoneyDto {
  @IsString()
  @Matches(/^\d+\.\d{2}$/, { message: 'amount must be a string with exactly 2 decimal places (e.g., "25.00")' })
  amount!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;
}

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

  @IsEnum(WagerTransactionKind)
  kind!: WagerTransactionKind;

  @IsDefined()
  @ValidateNested()
  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsOptional()
  @IsString()
  referenceExternalTransactionId?: string;
}