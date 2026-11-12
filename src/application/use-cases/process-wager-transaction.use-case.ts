import { createHash } from "node:crypto";
import { DomainException } from "../../domain/exceptions/domain.exception";
import { Money } from "../../domain/value-objects/money";
import { WagerTransaction } from "../../domain/entities/wager-transaction";
import { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { FailureCode } from "../../domain/enums/failure-code";
import { LedgerDirection } from "../../domain/enums/ledger-direction";
import { OutboxMessage } from "../../domain/entities/outbox-message";
import { WalletBalanceChanged } from "../../domain/events/wallet-balance-changed.event";
import { WagerTransactionProcessed } from "../../domain/events/wager-transaction-processed.event";
import { WagerTransactionRejected } from "../../domain/events/wager-transaction-rejected.event";
import { WagerTransactionPendingReference } from "../../domain/events/wager-transaction-pending-reference.event";
import { WalletRepositoryPort } from "../ports/wallet.repository";
import { WagerTransactionRepositoryPort } from "../ports/wager-transaction.repository";
import { OutboxRepositoryPort } from "../ports/outbox.repository";
import { UnitOfWorkPort } from "../ports/unit-of-work.port";
import { MetricsPort } from "../ports/metrics.port";
import { ProcessWagerInputDto, ProcessWagerOutputDto } from "../dtos/process-wager.dto";
import { Wallet } from "../../domain/entities/wallet";

export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly outboxRepo: OutboxRepositoryPort,
    private readonly uow: UnitOfWorkPort,
    private readonly metricsService?: MetricsPort,
  ) {}

  async execute(input: ProcessWagerInputDto, externalTx?: unknown): Promise<ProcessWagerOutputDto> {
    const startTime = performance.now();
    const idempotencyKey =
      input.idempotencyKey ?? `${input.providerId}:${input.externalTransactionId}`;
    const payloadHash = this.calculatePayloadHash(input);
    const correlationId = input.correlationId ?? crypto.randomUUID();
    const operationMoney = Money.from(input.money);

    const runInTransaction = async (tx: unknown): Promise<ProcessWagerOutputDto> => {
      // 1. Pré-checagem rápida de idempotência (caso já esteja commitada antes do lock)
      const preExistingTx = await this.wagerTxRepo.findByIdempotencyKey(idempotencyKey, tx);
      if (preExistingTx && !preExistingTx.matchesPayload(payloadHash)) {
        throw DomainException.conflict(
          "Payload conflitante para a mesma Idempotency Key.",
          FailureCode.PayloadMismatch,
        );
      }

      // 2. Lock Pessimista na carteira ANTES de decidir estado ou criar transação.
      // Serializa requisições concorrentes com a mesma Idempotency-Key ou para a mesma carteira.
      const wallet = await this.walletRepo.findByIdForUpdate(input.walletId, tx);

      if (!wallet) {
        throw DomainException.notFound(
          `Carteira ${input.walletId} não encontrada.`,
          "WALLET_NOT_FOUND",
        );
      }

      if (wallet.playerId !== input.playerId) {
        throw DomainException.validation(
          `Carteira ${input.walletId} não pertence ao jogador ${input.playerId}.`,
          "WALLET_PLAYER_MISMATCH",
        );
      }

      // 3. Re-checagem de Idempotência PÓS-LOCK (essencial quando 50 requests idênticos chegam juntos:
      // as 49 que aguardavam no SELECT FOR UPDATE da wallet agora enxergam a transação commitada pela 1ª)
      const existingTx =
        (await this.wagerTxRepo.findByIdempotencyKey(idempotencyKey, tx)) ??
        (await this.wagerTxRepo.findByProviderAndExternalId(
          input.providerId,
          input.externalTransactionId,
          tx,
        ));

      if (existingTx) {
        if (!existingTx.matchesPayload(payloadHash)) {
          throw DomainException.conflict(
            "Payload conflitante para a mesma Idempotency Key.",
            FailureCode.PayloadMismatch,
          );
        }

        if (existingTx.status !== WagerTransactionStatus.PendingReference) {
          this.metricsService?.incrementDuplicate();
          return this.buildReplayResponse(existingTx, wallet, tx);
        }
      }

      const wasAlreadyPendingReference =
        existingTx?.status === WagerTransactionStatus.PendingReference;

      const wagerTx =
        existingTx ??
        WagerTransaction.create({
          id: crypto.randomUUID(),
          providerId: input.providerId,
          externalTransactionId: input.externalTransactionId,
          idempotencyKey,
          payloadHash,
          walletId: input.walletId,
          playerId: input.playerId,
          roundId: input.roundId,
          gameId: input.gameId,
          kind: input.kind,
          money: operationMoney,
          referenceExternalTransactionId: input.referenceExternalTransactionId,
        });

      // Validação de moeda
      if (wallet.currency !== operationMoney.currency) {
        await this.rejectTransaction(wagerTx, FailureCode.InvalidCurrency, correlationId, tx);
        return this.buildProcessedOutput(wagerTx, wallet);
      }

      // 4. Processamento por tipo de operação delegando invariantes ao Domínio (Tell, Don't Ask)
      switch (input.kind) {
        case WagerTransactionKind.Bet: {
          if (!wallet.canCover(operationMoney)) {
            await this.rejectTransaction(
              wagerTx,
              FailureCode.InsufficientBalance,
              correlationId,
              tx,
            );
            break;
          }

          const { ledgerEntry } = wallet.debit(operationMoney, wagerTx.id);
          await this.applyProcessedBalanceChange(
            wallet,
            wagerTx,
            ledgerEntry,
            undefined,
            correlationId,
            tx,
          );
          break;
        }

        case WagerTransactionKind.Win: {
          let refTxId: string | undefined;
          if (input.referenceExternalTransactionId) {
            const refBet = await this.wagerTxRepo.findByProviderAndExternalId(
              input.providerId,
              input.referenceExternalTransactionId,
              tx,
            );

            if (!wagerTx.isValidBetReferenceForWin(refBet)) {
              await this.rejectTransaction(
                wagerTx,
                FailureCode.InvalidReferenceKind,
                correlationId,
                tx,
              );
              break;
            }
            refTxId = refBet.id;
          }

          const { ledgerEntry } = wallet.credit(operationMoney, wagerTx.id);
          await this.applyProcessedBalanceChange(
            wallet,
            wagerTx,
            ledgerEntry,
            refTxId,
            correlationId,
            tx,
          );
          break;
        }

        case WagerTransactionKind.Loss: {
          wagerTx.markProcessed(undefined);
          await this.wagerTxRepo.save(wagerTx, tx);
          await this.outboxRepo.save(
            OutboxMessage.enqueue(WagerTransactionProcessed.from(wagerTx, { correlationId })),
            tx,
          );
          break;
        }

        case WagerTransactionKind.Refund:
        case WagerTransactionKind.Rollback: {
          const refTx = await this.wagerTxRepo.findByProviderAndExternalId(
            input.providerId,
            input.referenceExternalTransactionId!,
            tx,
          );

          if (
            !refTx ||
            refTx.status === WagerTransactionStatus.Pending ||
            refTx.status === WagerTransactionStatus.PendingReference
          ) {
            const now = new Date();
            const isTtlExpired = now.getTime() - wagerTx.createdAt.getTime() > 60000;

            if (isTtlExpired && existingTx) {
              await this.rejectTransaction(
                wagerTx,
                FailureCode.ReferenceNotFound,
                correlationId,
                tx,
              );
            } else {
              wagerTx.markPendingReference();
              await this.wagerTxRepo.save(wagerTx, tx);
              if (!wasAlreadyPendingReference) {
                await this.outboxRepo.save(
                  OutboxMessage.enqueue(
                    WagerTransactionPendingReference.from(wagerTx, { correlationId }),
                  ),
                  tx,
                );
              }
            }
            break;
          }

          const priorReversals = await this.wagerTxRepo.findReversals(
            input.providerId,
            input.referenceExternalTransactionId!,
            input.kind,
            tx,
          );

          const validationFailure = wagerTx.validateReversalReference(refTx, priorReversals);
          if (validationFailure !== null) {
            await this.rejectTransaction(wagerTx, validationFailure, correlationId, tx);
            break;
          }

          const direction = wagerTx.ledgerDirectionFor(refTx);

          // Regra 9: Reversão que produziria saldo negativo é rejeitada explicitamente com NEGATIVE_BALANCE_PRODUCED
          if (direction === LedgerDirection.Debit && !wallet.canCover(operationMoney)) {
            await this.rejectTransaction(
              wagerTx,
              FailureCode.NegativeBalanceProduced,
              correlationId,
              tx,
            );
            break;
          }

          const { ledgerEntry } =
            direction === LedgerDirection.Credit
              ? wallet.credit(operationMoney, wagerTx.id)
              : wallet.debit(operationMoney, wagerTx.id);

          await this.applyProcessedBalanceChange(
            wallet,
            wagerTx,
            ledgerEntry,
            refTx.id,
            correlationId,
            tx,
          );
          break;
        }

        default:
          throw DomainException.validation(`Operação inválida: ${String(input.kind)}`);
      }

      return this.buildProcessedOutput(wagerTx, wallet);
    };

    try {
      const output = externalTx
        ? await runInTransaction(externalTx)
        : await this.uow.transaction(runInTransaction);
      this.metricsService?.recordLatency(performance.now() - startTime);
      return output;
    } catch (error: any) {
      // Fallback de segurança caso duas transações com a mesma Idempotency-Key em carteiras distintas
      // colidam na constraint UNIQUE do banco de dados
      const isUniqueViolation =
        error?.code === "23505" ||
        error?.name === "UniqueConstraintViolationException" ||
        (typeof error?.message === "string" && error.message.includes("unique constraint"));

      if (isUniqueViolation && !externalTx) {
        this.metricsService?.incrementLockConflict();
        const committedTx = await this.wagerTxRepo.findByIdempotencyKey(idempotencyKey);
        if (committedTx) {
          if (!committedTx.matchesPayload(payloadHash)) {
            throw DomainException.conflict(
              "Payload conflitante para a mesma Idempotency Key.",
              FailureCode.PayloadMismatch,
            );
          }
          const wallet = await this.walletRepo.findById(committedTx.walletId);
          this.metricsService?.incrementDuplicate();
          this.metricsService?.recordLatency(performance.now() - startTime);
          return this.buildReplayResponse(committedTx, wallet ?? undefined);
        }
      }

      if (error?.code === "40P01" || error?.code === "55P03") {
        this.metricsService?.incrementLockConflict();
      }
      throw error;
    }
  }

  private async rejectTransaction(
    wagerTx: WagerTransaction,
    code: FailureCode,
    correlationId: string,
    tx: unknown,
  ): Promise<void> {
    wagerTx.reject(code);
    await this.wagerTxRepo.save(wagerTx, tx);
    await this.outboxRepo.save(
      OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
      tx,
    );
  }

  private async applyProcessedBalanceChange(
    wallet: Wallet,
    wagerTx: WagerTransaction,
    ledgerEntry: Parameters<WalletRepositoryPort["saveLedgerEntry"]>[0],
    referenceTransactionId: string | undefined,
    correlationId: string,
    tx: unknown,
  ): Promise<void> {
    await this.walletRepo.save(wallet, tx);
    await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

    wagerTx.markProcessed(referenceTransactionId);
    await this.wagerTxRepo.save(wagerTx, tx);

    await this.outboxRepo.save(
      OutboxMessage.enqueue(WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId })),
      tx,
    );
    await this.outboxRepo.save(
      OutboxMessage.enqueue(WagerTransactionProcessed.from(wagerTx, { correlationId })),
      tx,
    );
  }

  private buildProcessedOutput(wagerTx: WagerTransaction, wallet: Wallet): ProcessWagerOutputDto {
    this.metricsService?.incrementTransaction(wagerTx.status);
    return {
      transactionId: wagerTx.id,
      status: wagerTx.status,
      balance: wallet.balance.toJSON(),
      idempotentReplay: false,
      failureCode: wagerTx.failureCode,
    };
  }

  private async buildReplayResponse(
    existingTx: WagerTransaction,
    wallet?: Wallet,
    tx?: unknown,
  ): Promise<ProcessWagerOutputDto> {
    if (this.walletRepo.findLedgerEntryByTransactionId) {
      const entry = await this.walletRepo.findLedgerEntryByTransactionId(
        existingTx.walletId,
        existingTx.id,
        tx,
      );
      if (entry) {
        return {
          transactionId: existingTx.id,
          status: existingTx.status,
          balance: entry.balanceAfter.toJSON(),
          idempotentReplay: true,
          failureCode: existingTx.failureCode,
        };
      }
    } else {
      const entries = await this.walletRepo.getLedgerEntries(
        existingTx.walletId,
        Number.MAX_SAFE_INTEGER,
        undefined,
        tx,
      );
      const matchingEntry = entries.find((e) => e.transactionId === existingTx.id);
      if (matchingEntry) {
        return {
          transactionId: existingTx.id,
          status: existingTx.status,
          balance: matchingEntry.balanceAfter.toJSON(),
          idempotentReplay: true,
          failureCode: existingTx.failureCode,
        };
      }
    }

    const resolvedWallet = wallet ?? (await this.walletRepo.findById(existingTx.walletId, tx));
    return {
      transactionId: existingTx.id,
      status: existingTx.status,
      balance: resolvedWallet?.balance.toJSON(),
      idempotentReplay: true,
      failureCode: existingTx.failureCode,
    };
  }

  private calculatePayloadHash(input: ProcessWagerInputDto): string {
    const canonicalObject = {
      gameId: input.gameId,
      kind: input.kind,
      money: { amount: input.money?.amount, currency: input.money?.currency },
      playerId: input.playerId,
      providerId: input.providerId,
      referenceExternalTransactionId: input.referenceExternalTransactionId ?? null,
      roundId: input.roundId,
      walletId: input.walletId,
    };

    return createHash("sha256").update(JSON.stringify(canonicalObject)).digest("hex");
  }
}
