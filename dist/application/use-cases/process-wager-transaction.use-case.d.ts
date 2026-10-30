import { WalletRepositoryPort } from '../ports/wallet.repository';
import { WagerTransactionRepositoryPort } from '../ports/wager-transaction.repository';
import { OutboxRepositoryPort } from '../ports/outbox.repository';
import { UnitOfWorkPort } from '../ports/unit-of-work.port';
import { ProcessWagerInputDto, ProcessWagerOutputDto } from '../dtos/process-wager.dto';
export declare class ProcessWagerTransactionUseCase {
    private readonly walletRepo;
    private readonly wagerTxRepo;
    private readonly outboxRepo;
    private readonly uow;
    constructor(walletRepo: WalletRepositoryPort, wagerTxRepo: WagerTransactionRepositoryPort, outboxRepo: OutboxRepositoryPort, uow: UnitOfWorkPort);
    execute(input: ProcessWagerInputDto, tx?: unknown): Promise<ProcessWagerOutputDto>;
    private calculatePayloadHash;
}
