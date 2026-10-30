import { MikroOrmWalletRepository } from '../../database/repositories/mikro-orm-wallet.repository';
import { MikroOrmUnitOfWork } from '../../database/unit-of-work';
export declare class WalletController {
    private readonly walletRepo;
    private readonly uow;
    constructor(walletRepo: MikroOrmWalletRepository, uow: MikroOrmUnitOfWork);
    createWallet(body: {
        playerId: string;
        initialBalance: {
            amount: string;
            currency: string;
        };
    }): Promise<{
        id: string;
        playerId: string;
        balance: import("../../../domain/value-objects/money").MoneyProps;
        version: number;
    }>;
    getWallet(walletId: string): Promise<{
        id: string;
        playerId: string;
        balance: import("../../../domain/value-objects/money").MoneyProps;
        version: number;
    }>;
}
