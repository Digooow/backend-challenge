import { ProcessWagerTransactionUseCase } from "../../application/use-cases/process-wager-transaction.use-case";
import { ProcessWagerInputDto } from "../../application/dtos/process-wager.dto";
export declare class WagerController {
    private readonly processWagerUseCase;
    constructor(processWagerUseCase: ProcessWagerTransactionUseCase);
    processTransaction(idempotencyKey: string, payload: Omit<ProcessWagerInputDto, "idempotencyKey">): Promise<import("../../application/dtos/process-wager.dto").ProcessWagerOutputDto>;
}
