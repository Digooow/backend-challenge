import { IsNotEmpty, IsString, Matches, ValidateNested, IsObject } from "class-validator";
import { Type } from "class-transformer";
import { MoneyProps } from "../../domain/value-objects/money";

export class MoneyRequestDto implements MoneyProps {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d{2}$/, {
    message: "Escala exata de 2 casas decimais positivas exigida (ex: '25.00').",
  })
  amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: "Moeda deve seguir o padrão ISO-4217 de 3 letras maiúsculas (ex: 'BRL').",
  })
  currency!: string;
}

export class CreateWalletRequestDto implements CreateWalletInputDto {
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => MoneyRequestDto)
  initialBalance!: MoneyRequestDto;
}

export interface CreateWalletInputDto {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface CreateWalletOutputDto {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}