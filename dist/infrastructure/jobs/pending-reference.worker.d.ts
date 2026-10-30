import { WagerTransactionRepositoryPort } from "../../application/ports/wager-transaction.repository";
import { ProcessWagerTransactionUseCase } from "../../application/use-cases/process-wager-transaction.use-case";
import { UnitOfWorkPort } from "../../application/ports/unit-of-work.port";
export declare class PendingReferenceWorker {
    private readonly wagerTxRepo;
    private readonly useCase;
    private readonly uow;
    private readonly logger;
    private isProcessing;
    constructor(wagerTxRepo: WagerTransactionRepositoryPort, useCase: ProcessWagerTransactionUseCase, uow: UnitOfWorkPort);
    handle(): Promise<void>;
}
