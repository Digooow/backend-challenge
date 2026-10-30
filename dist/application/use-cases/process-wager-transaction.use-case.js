"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessWagerTransactionUseCase = void 0;
const node_crypto_1 = require("node:crypto");
const domain_exception_1 = require("../../domain/exceptions/domain.exception");
const money_1 = require("../../domain/value-objects/money");
const wager_transaction_1 = require("../../domain/entities/wager-transaction");
const wager_transaction_kind_1 = require("../../domain/enums/wager-transaction-kind");
const failure_code_1 = require("../../domain/enums/failure-code");
const outbox_message_1 = require("../../domain/entities/outbox-message");
const wallet_balance_changed_event_1 = require("../../domain/events/wallet-balance-changed.event");
class ProcessWagerTransactionUseCase {
    constructor(walletRepo, wagerTxRepo, outboxRepo, uow) {
        this.walletRepo = walletRepo;
        this.wagerTxRepo = wagerTxRepo;
        this.outboxRepo = outboxRepo;
        this.uow = uow;
    }
    async execute(input, tx) {
        const idempotencyKey = input.idempotencyKey ?? `${input.providerId}:${input.externalTransactionId}`;
        const payloadHash = this.calculatePayloadHash(input);
        const correlationId = input.correlationId ?? crypto.randomUUID();
        return this.uow.transaction(async (tx) => {
            const existingTx = await this.wagerTxRepo.findByIdempotencyKey(idempotencyKey, tx);
            if (existingTx) {
                if (!existingTx.matchesPayload(payloadHash)) {
                    throw new domain_exception_1.DomainException('Payload conflitante para a mesma Idempotency Key.');
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
            const operationMoney = money_1.Money.from(input.money);
            const wallet = await this.walletRepo.findByIdForUpdate(input.walletId, tx);
            if (!wallet) {
                throw new domain_exception_1.DomainException(`Carteira ${input.walletId} não encontrada.`);
            }
            const wagerTx = wager_transaction_1.WagerTransaction.create({
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
            try {
                switch (input.kind) {
                    case wager_transaction_kind_1.WagerTransactionKind.Bet: {
                        const { ledgerEntry } = wallet.debit(operationMoney, wagerTx.id);
                        await this.walletRepo.save(wallet, tx);
                        await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);
                        wagerTx.markProcessed(undefined);
                        await this.wagerTxRepo.save(wagerTx, tx);
                        const event = wallet_balance_changed_event_1.WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId });
                        await this.outboxRepo.save(outbox_message_1.OutboxMessage.enqueue(event), tx);
                        break;
                    }
                    case wager_transaction_kind_1.WagerTransactionKind.Win: {
                        const { ledgerEntry } = wallet.credit(operationMoney, wagerTx.id);
                        await this.walletRepo.save(wallet, tx);
                        await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);
                        wagerTx.markProcessed(undefined);
                        await this.wagerTxRepo.save(wagerTx, tx);
                        const event = wallet_balance_changed_event_1.WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId });
                        await this.outboxRepo.save(outbox_message_1.OutboxMessage.enqueue(event), tx);
                        break;
                    }
                    case wager_transaction_kind_1.WagerTransactionKind.Loss: {
                        wagerTx.markProcessed(undefined);
                        await this.wagerTxRepo.save(wagerTx, tx);
                        break;
                    }
                    case wager_transaction_kind_1.WagerTransactionKind.Refund:
                    case wager_transaction_kind_1.WagerTransactionKind.Rollback: {
                        const refTx = await this.wagerTxRepo.findByProviderAndExternalId(input.providerId, input.referenceExternalTransactionId, tx);
                        if (!refTx) {
                            wagerTx.markPendingReference();
                            await this.wagerTxRepo.save(wagerTx, tx);
                            break;
                        }
                        const isDebitReversal = refTx.kind === wager_transaction_kind_1.WagerTransactionKind.Bet;
                        const { ledgerEntry } = isDebitReversal
                            ? wallet.credit(operationMoney, wagerTx.id)
                            : wallet.debit(operationMoney, wagerTx.id);
                        await this.walletRepo.save(wallet, tx);
                        await this.walletRepo.saveLedgerEntry(ledgerEntry, tx);
                        wagerTx.markProcessed(refTx.id);
                        await this.wagerTxRepo.save(wagerTx, tx);
                        const event = wallet_balance_changed_event_1.WalletBalanceChanged.from(wallet, ledgerEntry, { correlationId });
                        await this.outboxRepo.save(outbox_message_1.OutboxMessage.enqueue(event), tx);
                        break;
                    }
                }
            }
            catch (err) {
                if (err instanceof domain_exception_1.DomainException && err.message.includes('Saldo insuficiente')) {
                    wagerTx.reject(failure_code_1.FailureCode.InsufficientBalance);
                    await this.wagerTxRepo.save(wagerTx, tx);
                }
                else {
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
    calculatePayloadHash(input) {
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
        return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(canonicalObject)).digest('hex');
    }
}
exports.ProcessWagerTransactionUseCase = ProcessWagerTransactionUseCase;
//# sourceMappingURL=process-wager-transaction.use-case.js.map