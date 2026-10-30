import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { WagerTransactionRepositoryPort } from "../../application/ports/wager-transaction.repository";
import { ProcessWagerTransactionUseCase } from "../../application/use-cases/process-wager-transaction.use-case";
import { UnitOfWorkPort } from "../../application/ports/unit-of-work.port";

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private isProcessing = false;

  constructor(
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly useCase: ProcessWagerTransactionUseCase,
    private readonly uow: UnitOfWorkPort
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handle() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingTransactions = await this.wagerTxRepo.findPendingReferences(10);

      if (pendingTransactions.length === 0) {
        return;
      }

      this.logger.log(`Encontradas ${pendingTransactions.length} transações aguardando referência. Reprocessando...`);

      for (const tx of pendingTransactions) {
        try {
          const input = {
            providerId: tx.providerId,
            externalTransactionId: tx.externalTransactionId,
            idempotencyKey: tx.idempotencyKey,
            playerId: tx.playerId,
            walletId: tx.walletId,
            roundId: tx.roundId,
            gameId: tx.gameId,
            kind: tx.kind,
            money: tx.money.toJSON(), // Corrected: Use toJSON() to safely extract amount and currency
            referenceExternalTransactionId: tx.referenceExternalTransactionId,
          };

          await this.useCase.execute(input);
          this.logger.log(`Transação pendente ${tx.id} processada com sucesso.`);
        } catch (error) {
          // Corrected: Safely type-check the unknown error
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Transação pendente ${tx.id} falhou ao reprocessar: ${errorMessage}`);
        }
      }
    } catch (error) {
      this.logger.error("Erro fatal no PendingReferenceWorker", error);
    } finally {
      this.isProcessing = false;
    }
  }
}