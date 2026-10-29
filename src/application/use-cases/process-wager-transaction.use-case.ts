import { createHash } from "node:crypto";
import { DomainException } from "../../domain/exceptions/domain.exception";
import { Money } from "../../domain/value-objects/money";
import { WagerTransaction } from "../../domain/entities/wager-transaction";
import { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";
import { FailureCode } from "../../domain/enums/failure-code";
import { OutboxMessage } from "../../domain/entities/outbox-message";
import { WalletBalanceChanged } from "../../domain/events/wallet-balance-changed.event";
import { WalletRepositoryPort } from "../ports/wallet.repository";
import { WagerTransactionRepositoryPort } from "../ports/wager-transaction.repository";
import { OutboxRepositoryPort } from "../ports/outbox.repository";
import { UnitOfWorkPort } from "../ports/unit-of-work.port";
import { ProcessWagerInputDto, ProcessWagerOutputDto } from "../dtos/process-wager.dto";

export class ProcessWagerTransactionUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly wagerTxRepo: WagerTransactionRepositoryPort,
    private readonly outboxRepo: OutboxRepositoryPort,
    private readonly uow: UnitOfWorkPort,
  ) {}

  async execute(input: ProcessWagerInputDto): Promise<ProcessWagerOutputDto> {
    const idempotencyKey = input.idempotencyKey ?? `${input.providerId}:${input.externalTransactionId}`;
    const payloadHash = this.calculatePayloadHash(input);
    const correlationId = input.correlationId ?? crypto.randomUUID();

    return this.uow.transaction(async (tx) => {
      // 1. Idempotência Persistente
      const existingTx = await this.wagerTxRepo.findByIdempotencyKey(idempotencyKey, tx);

      if (existingTx) {
        if (!existingTx.matchesPayload(payloadHash)) {
          throw new DomainException("Payload conflitante para a mesma Idempotency Key.");
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

      // 2. Validações de domínio iniciais
      const operationMoney = Money.from(input.money);
      const wallet = await this.walletRepo.findById(input.walletId, tx);

      if (!wallet) {
        throw new DomainException(`Carteira ${input.walletId} não encontrada.`);
      }

      const wagerTx = WagerTransaction.create({
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

      // 3. Processamento por tipo de operação
      try {
        switch (input.kind) {
          case WagerTransactionKind.Bet: {
            const { ledgerEntry } = wallet.debit(operationMoney, wagerTx.id);
            await this.walletRepo.save(wallet, tx);
            await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

            wagerTx.markProcessed(undefined);
            await this.wagerTxRepo.save(wagerTx, tx);

            const event = WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId });
            await this.outboxRepo.save(OutboxMessage.enqueue(event), tx);
            break;
          }

          case WagerTransactionKind.Win: {
            const { ledgerEntry } = wallet.credit(operationMoney, wagerTx.id);
            await this.walletRepo.save(wallet, tx);
            await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

            wagerTx.markProcessed(undefined);
            await this.wagerTxRepo.save(wagerTx, tx);

            const event = WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId });
            await this.outboxRepo.save(OutboxMessage.enqueue(event), tx);
            break;
          }

          case WagerTransactionKind.Loss: {
            wagerTx.markProcessed(undefined);
            await this.wagerTxRepo.save(wagerTx, tx);
            break;
          }

          case WagerTransactionKind.Refund:
          case WagerTransactionKind.Rollback: {
            const refTx = await this.wagerTxRepo.findByProviderAndExternalId(
              input.providerId,
              input.referenceExternalTransactionId!,
              tx
            );

            if (!refTx) {
              wagerTx.markPendingReference();
              await this.wagerTxRepo.save(wagerTx, tx);
              break;
            }

            // Aplicar reversão do saldo
            const isDebitReversal = refTx.kind === WagerTransactionKind.Bet;
            const { ledgerEntry } = isDebitReversal
              ? wallet.credit(operationMoney, wagerTx.id)
              : wallet.debit(operationMoney, wagerTx.id);

            await this.walletRepo.save(wallet, tx);
            await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);

            wagerTx.markProcessed(refTx.id);
            await this.wagerTxRepo.save(wagerTx, tx);

            const event = WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId });
            await this.outboxRepo.save(OutboxMessage.enqueue(event), tx);
            break;
          }
        }
      } catch (err: unknown) {
        if (err instanceof DomainException && err.message.includes("Saldo insuficiente")) {
          wagerTx.reject(FailureCode.InsufficientBalance);
          await this.wagerTxRepo.save(wagerTx, tx);
        } else {
          throw err;
        }
      }

      return {
        transactionId: wagerTx.id,
        status: wagerTx.status,
        balance: wallet.balance.toJSON(),
        idempotentReplay: false,
        failureCode: wagerTx.failureCode,
      };
    });
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

    return createHash("sha256").update(JSON.stringify(canonicalObject)).digest("hex");
  }
}