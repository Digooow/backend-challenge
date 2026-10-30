import { createHash } from 'node:crypto';
import { DomainException } from '../../domain/exceptions/domain.exception';
import { Money } from '../../domain/value-objects/money';
import { WagerTransaction } from '../../domain/entities/wager-transaction';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status';
import { FailureCode } from '../../domain/enums/failure-code';
import { OutboxMessage } from '../../domain/entities/outbox-message';
import { WalletBalanceChanged } from '../../domain/events/wallet-balance-changed.event';
import { WagerTransactionProcessed } from '../../domain/events/wager-transaction-processed.event';
import { WagerTransactionRejected } from '../../domain/events/wager-transaction-rejected.event';
import { WagerTransactionPendingReference } from '../../domain/events/wager-transaction-pending-reference.event';
import { WalletRepositoryPort } from '../ports/wallet.repository';
import { WagerTransactionRepositoryPort } from '../ports/wager-transaction.repository';
import { OutboxRepositoryPort } from '../ports/outbox.repository';
import { UnitOfWorkPort } from '../ports/unit-of-work.port';
import { ProcessWagerInputDto, ProcessWagerOutputDto } from '../dtos/process-wager.dto';

export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly outboxRepo: OutboxRepositoryPort,
    private readonly uow: UnitOfWorkPort,
  ) {}

  async execute(input: ProcessWagerInputDto, externalTx?: unknown): Promise<ProcessWagerOutputDto> {
    const idempotencyKey = input.idempotencyKey ?? `${input.providerId}:${input.externalTransactionId}`;
    const payloadHash = this.calculatePayloadHash(input);
    const correlationId = input.correlationId ?? crypto.randomUUID();

    const runInTransaction = async (tx: unknown): Promise<ProcessWagerOutputDto> => {
      // 1. Idempotência Persistente
      const existingTx = await this.wagerTxRepo.findByIdempotencyKey(idempotencyKey, tx);

      if (existingTx) {
        if (!existingTx.matchesPayload(payloadHash)) {
          throw new DomainException('Payload conflitante para a mesma Idempotency Key.');
        }

        if (existingTx.status !== WagerTransactionStatus.PendingReference) {
          // Regra 7: Retorna o resultado original, incluindo o saldo observado naquele momento
          const entries = await this.walletRepo.getLedgerEntries(existingTx.walletId, 500, undefined, tx);
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

          const wallet = await this.walletRepo.findById(existingTx.walletId, tx);
          return {
            transactionId: existingTx.id,
            status: existingTx.status,
            balance: wallet?.balance.toJSON(),
            idempotentReplay: true,
            failureCode: existingTx.failureCode,
          };
        }
      }

      const operationMoney = Money.from(input.money);

      // 2. Lock Pessimista na carteira para garantir consistência e serialização
      const wallet = await this.walletRepo.findByIdForUpdate(input.walletId, tx);

      if (!wallet) {
        throw new DomainException(`Carteira ${input.walletId} não encontrada.`);
      }

      const wagerTx = existingTx ?? WagerTransaction.create({
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
        wagerTx.reject(FailureCode.InvalidCurrency);
        await this.wagerTxRepo.save(wagerTx, tx);
        await this.outboxRepo.save(
          OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
          tx
        );
        return {
          transactionId: wagerTx.id,
          status: wagerTx.status,
          balance: wallet.balance.toJSON(),
          idempotentReplay: false,
          failureCode: wagerTx.failureCode,
        };
      }

      // 3. Processamento por tipo de operação
      switch (input.kind) {
        case WagerTransactionKind.Bet: {
          try {
            const { ledgerEntry } = wallet.debit(operationMoney, wagerTx.id);
            await this.walletRepo.save(wallet, tx);
            await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

            wagerTx.markProcessed(undefined);
            await this.wagerTxRepo.save(wagerTx, tx);

            await this.outboxRepo.save(
              OutboxMessage.enqueue(WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId })),
              tx
            );
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionProcessed.from(wagerTx, { correlationId })),
              tx
            );
          } catch (err: unknown) {
            if (err instanceof DomainException && err.message.includes('Saldo insuficiente')) {
              wagerTx.reject(FailureCode.InsufficientBalance);
              await this.wagerTxRepo.save(wagerTx, tx);
              await this.outboxRepo.save(
                OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
                tx
              );
            } else {
              throw err;
            }
          }
          break;
        }

        case WagerTransactionKind.Win: {
          const { ledgerEntry } = wallet.credit(operationMoney, wagerTx.id);
          await this.walletRepo.save(wallet, tx);
          await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

          wagerTx.markProcessed(undefined);
          await this.wagerTxRepo.save(wagerTx, tx);

          await this.outboxRepo.save(
            OutboxMessage.enqueue(WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId })),
            tx
          );
          await this.outboxRepo.save(
            OutboxMessage.enqueue(WagerTransactionProcessed.from(wagerTx, { correlationId })),
            tx
          );
          break;
        }

        case WagerTransactionKind.Loss: {
          wagerTx.markProcessed(undefined);
          await this.wagerTxRepo.save(wagerTx, tx);
          await this.outboxRepo.save(
            OutboxMessage.enqueue(WagerTransactionProcessed.from(wagerTx, { correlationId })),
            tx
          );
          break;
        }

        case WagerTransactionKind.Refund:
        case WagerTransactionKind.Rollback: {
          const refTx = await this.wagerTxRepo.findByProviderAndExternalId(
            input.providerId,
            input.referenceExternalTransactionId!,
            tx
          );

          if (!refTx || refTx.status === WagerTransactionStatus.Pending || refTx.status === WagerTransactionStatus.PendingReference) {
            const now = new Date();
            const isTtlExpired = (now.getTime() - wagerTx.createdAt.getTime()) > 60000;

            if (isTtlExpired && existingTx) {
              wagerTx.reject(FailureCode.ReferenceNotFound);
              await this.wagerTxRepo.save(wagerTx, tx);
              await this.outboxRepo.save(
                OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
                tx
              );
            } else {
              wagerTx.markPendingReference();
              await this.wagerTxRepo.save(wagerTx, tx);
              await this.outboxRepo.save(
                OutboxMessage.enqueue(WagerTransactionPendingReference.from(wagerTx, { correlationId })),
                tx
              );
            }
            break;
          }

          if (refTx.status !== WagerTransactionStatus.Processed) {
            wagerTx.reject(FailureCode.InvalidReferenceKind);
            await this.wagerTxRepo.save(wagerTx, tx);
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
              tx
            );
            break;
          }

          // Regra 2: Mesma rodada, player, wallet e moeda
          const matchesContext =
            refTx.playerId === input.playerId &&
            refTx.walletId === input.walletId &&
            refTx.money.currency === operationMoney.currency &&
            refTx.roundId === input.roundId;

          if (!matchesContext) {
            wagerTx.reject(FailureCode.InvalidReferenceKind);
            await this.wagerTxRepo.save(wagerTx, tx);
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
              tx
            );
            break;
          }

          // Regra 3: REFUND só referencia BET. ROLLBACK referencia BET, WIN ou REFUND.
          if (input.kind === WagerTransactionKind.Refund && refTx.kind !== WagerTransactionKind.Bet) {
            wagerTx.reject(FailureCode.InvalidReferenceKind);
            await this.wagerTxRepo.save(wagerTx, tx);
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
              tx
            );
            break;
          }

          if (
            input.kind === WagerTransactionKind.Rollback &&
            refTx.kind !== WagerTransactionKind.Bet &&
            refTx.kind !== WagerTransactionKind.Win &&
            refTx.kind !== WagerTransactionKind.Refund
          ) {
            wagerTx.reject(FailureCode.InvalidReferenceKind);
            await this.wagerTxRepo.save(wagerTx, tx);
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
              tx
            );
            break;
          }

          // Regra 5: O valor deve ser idêntico ao da referência
          if (!refTx.money.equals(operationMoney)) {
            wagerTx.reject(FailureCode.InvalidAmount);
            await this.wagerTxRepo.save(wagerTx, tx);
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
              tx
            );
            break;
          }

          // Regra 4: Uma referência não pode ser revertida duas vezes pelo mesmo tipo de operação
          const priorReversals = await this.wagerTxRepo.findReversals(
            input.providerId,
            input.referenceExternalTransactionId!,
            input.kind,
            tx
          );
          const alreadyReverted = priorReversals.some((r) => r.id !== wagerTx.id);
          if (alreadyReverted) {
            wagerTx.reject(FailureCode.ReferenceAlreadyReverted);
            await this.wagerTxRepo.save(wagerTx, tx);
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
              tx
            );
            break;
          }

          // Efeito da reversão:
          // Se a referência era BET (débito) -> reversão é CRÉDITO
          // Se a referência era WIN ou REFUND (crédito) -> reversão é DÉBITO
          const isDebitReversal = refTx.kind === WagerTransactionKind.Bet;

          try {
            const { ledgerEntry } = isDebitReversal
              ? wallet.credit(operationMoney, wagerTx.id)
              : wallet.debit(operationMoney, wagerTx.id);

            await this.walletRepo.save(wallet, tx);
            await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

            wagerTx.markProcessed(refTx.id);
            await this.wagerTxRepo.save(wagerTx, tx);

            await this.outboxRepo.save(
              OutboxMessage.enqueue(WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId })),
              tx
            );
            await this.outboxRepo.save(
              OutboxMessage.enqueue(WagerTransactionProcessed.from(wagerTx, { correlationId })),
              tx
            );
          } catch (err: unknown) {
            // Regra 9: Reversão que produziria saldo negativo é rejeitada com NEGATIVE_BALANCE_PRODUCED
            if (err instanceof DomainException && err.message.includes('Saldo insuficiente')) {
              wagerTx.reject(FailureCode.NegativeBalanceProduced);
              await this.wagerTxRepo.save(wagerTx, tx);
              await this.outboxRepo.save(
                OutboxMessage.enqueue(WagerTransactionRejected.from(wagerTx, { correlationId })),
                tx
              );
            } else {
              throw err;
            }
          }
          break;
        }
      }

      return {
        transactionId: wagerTx.id,
        status: wagerTx.status,
        balance: wallet.balance.toJSON(),
        idempotentReplay: false,
        failureCode: wagerTx.failureCode,
      };
    };

    // Reutiliza a transação SQL externa (ex: SQS Consumer com Inbox) quando fornecida,
    // garantindo atomicidade absoluta entre Inbox, Wallet, Ledger, WagerTx e Outbox.
    return externalTx ? runInTransaction(externalTx) : this.uow.transaction(runInTransaction);
  }

  private calculatePayloadHash(input: ProcessWagerInputDto): string {
    const canonicalObject = {
      gameId: input.gameId,
      kind: input.kind,
      money: { amount: input.money.amount, currency: input.money.currency },
      playerId: input.playerId,
      providerId: input.providerId,
      referenceExternalTransactionId: input.referenceExternalTransactionId ?? null,
      roundId: input.roundId,
      walletId: input.walletId,
    };

    return createHash('sha256').update(JSON.stringify(canonicalObject)).digest('hex');
  }
}
