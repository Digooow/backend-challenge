import { MoneyProps } from "../../domain/value-objects/money";
import { WalletRepositoryPort } from "../ports/wallet.repository";
export interface ReconcileWalletOutputDto {
    walletId: string;
    storedBalance: MoneyProps;
    calculatedBalance: MoneyProps;
    difference: MoneyProps;
    consistent: boolean;
    checkedEntries: number;
}
export declare class ReconcileWalletUseCase {
    private readonly walletRepo;
    constructor(walletRepo: WalletRepositoryPort);
    execute(walletId: string): Promise<ReconcileWalletOutputDto>;
}
