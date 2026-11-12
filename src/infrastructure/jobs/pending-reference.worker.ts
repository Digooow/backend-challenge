import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { WagerTransactionRepositoryPort } from "../../application/ports/wager-transaction.repository";
import { ProcessWagerTransactionUseCase } from "../../application/use-cases/process-wager-transaction.use-case";
import type { UnitOfWorkPort } from "../../application/ports/unit-of-work.port";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { MetricsService } from "../observability/metrics.service";

interface BackoffEntry {
  attempts: number;
  nextAttemptAt: number;
}

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private isProcessing = false;
  private readonly backoffMap = new Map<string, BackoffEntry>();

  constructor(
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly useCase: ProcessWagerTransactionUseCase,
    private readonly uow: UnitOfWorkPort,
    private readonly metricsService?: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handle() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.uow.transaction(async (tx) => {
        // FOR UPDATE SKIP LOCKED é ativado ao passar `tx` para findPendingReferences
        const pendingTransactions = await this.wagerTxRepo.findPendingReferences(50, tx);

        if (pendingTransactions.length === 0) {
          return;
        }

        const nowMs = Date.now();

        for (const pendingTx of pendingTransactions) {
          const ageMs = nowMs - pendingTx.createdAt.getTime();
          const isTtlExpired = ageMs > 60000;
          const backoff = this.backoffMap.get(pendingTx.id);

          // Respeita a janela de backoff exponencial, exceto se o TTL já expirou (para rejeitar imediatamente)
          if (!isTtlExpired && backoff && nowMs < backoff.nextAttemptAt) {
            continue;
          }

          try {
            const input = {
              providerId: pendingTx.providerId,
              externalTransactionId: pendingTx.externalTransactionId,
              idempotencyKey: pendingTx.idempotencyKey,
              playerId: pendingTx.playerId,
              walletId: pendingTx.walletId,
              roundId: pendingTx.roundId,
              gameId: pendingTx.gameId,
              kind: pendingTx.kind,
              money: pendingTx.money.toJSON(),
              referenceExternalTransactionId: pendingTx.referenceExternalTransactionId,
            };

            const result = await this.useCase.execute(input, tx);

            if (result.status !== WagerTransactionStatus.PendingReference) {
              this.backoffMap.delete(pendingTx.id);
              this.logger.log({
                message: `Transação pendente resolvida com status ${result.status}`,
                transactionId: pendingTx.id,
                walletId: pendingTx.walletId,
                providerId: pendingTx.providerId,
                status: result.status,
              });
            } else {
              const attempts = (backoff?.attempts ?? 0) + 1;
              const delayMs = Math.min(Math.pow(2, attempts) * 1000, 30000);
              this.backoffMap.set(pendingTx.id, {
                attempts,
                nextAttemptAt: nowMs + delayMs,
              });
              this.metricsService?.incrementRetry();
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn({
              message: `Transação pendente ${pendingTx.id} falhou ao reprocessar: ${errorMessage}`,
              transactionId: pendingTx.id,
              walletId: pendingTx.walletId,
            });
          }
        }
      });
    } catch (error) {
      this.logger.error("Erro fatal no PendingReferenceWorker", error);
    } finally {
      this.isProcessing = false;
    }
  }
}