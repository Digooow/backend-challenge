import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/process-wager-transaction.use-case';
import { ProcessWagerRequestDto } from '../dtos/wager.dto';
export declare class WagerController {
    private readonly processWagerUseCase;
    constructor(processWagerUseCase: ProcessWagerTransactionUseCase);
    processTransaction(idempotencyKey: string, dto: ProcessWagerRequestDto): Promise<import("../../../application/dtos/process-wager.dto").ProcessWagerOutputDto>;
}
