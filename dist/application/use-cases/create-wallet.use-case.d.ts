import { WalletRepositoryPort } from "../ports/wallet.repository";
import { UnitOfWorkPort } from "../ports/unit-of-work.port";
import { CreateWalletInputDto, CreateWalletOutputDto } from "../dtos/create-wallet.dto";
export declare class CreateWalletUseCase {
    private readonly walletRepo;
    private readonly uow;
    constructor(walletRepo: WalletRepositoryPort, uow: UnitOfWorkPort);
    execute(input: CreateWalletInputDto): Promise<CreateWalletOutputDto>;
}
