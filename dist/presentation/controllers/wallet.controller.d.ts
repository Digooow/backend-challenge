import { WalletRepositoryPort } from "../../application/ports/wallet.repository";
import { ReconcileWalletUseCase } from "../../application/use-cases/reconcile-wallet.use-case";
import { EntityManager } from "@mikro-orm/postgresql";
export declare class WalletController {
    private readonly walletRepo;
    private readonly reconcileUseCase;
    private readonly em;
    constructor(walletRepo: WalletRepositoryPort, reconcileUseCase: ReconcileWalletUseCase, em: EntityManager);
    createWallet(body: {
        playerId: string;
        initialBalance: {
            amount: string;
            currency: string;
        };
    }): Promise<{
        id: string;
        playerId: string;
        balance: import("../../domain/value-objects/money").MoneyProps;
        version: number;
    }>;
    getWallet(walletId: string): Promise<{
        id: string;
        playerId: string;
        balance: import("../../domain/value-objects/money").MoneyProps;
        version: number;
    }>;
    reconcileWallet(walletId: string): Promise<import("../../application/use-cases/reconcile-wallet.use-case").ReconcileWalletOutputDto>;
}
