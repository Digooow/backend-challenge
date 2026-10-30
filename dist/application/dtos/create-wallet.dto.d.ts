import { MoneyProps } from "../../domain/value-objects/money";
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
