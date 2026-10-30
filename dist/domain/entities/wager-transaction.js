"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WagerTransaction = void 0;
const domain_exception_1 = require("../exceptions/domain.exception");
const invalid_transaction_state_exception_1 = require("../exceptions/invalid-transaction-state.exception");
const wager_transaction_kind_1 = require("../enums/wager-transaction-kind");
const wager_transaction_status_1 = require("../enums/wager-transaction-status");
class WagerTransaction {
    constructor(id, providerId, externalTransactionId, idempotencyKey, payloadHash, walletId, playerId, roundId, gameId, kind, money, referenceExternalTransactionId, createdAt, _status, _referenceTransactionId, _failureCode, _processedAt) {
        this.id = id;
        this.providerId = providerId;
        this.externalTransactionId = externalTransactionId;
        this.idempotencyKey = idempotencyKey;
        this.payloadHash = payloadHash;
        this.walletId = walletId;
        this.playerId = playerId;
        this.roundId = roundId;
        this.gameId = gameId;
        this.kind = kind;
        this.money = money;
        this.referenceExternalTransactionId = referenceExternalTransactionId;
        this.createdAt = createdAt;
        this._status = _status;
        this._referenceTransactionId = _referenceTransactionId;
        this._failureCode = _failureCode;
        this._processedAt = _processedAt;
    }
    static create(props) {
        if (props.kind === wager_transaction_kind_1.WagerTransactionKind.Opening) {
            throw new domain_exception_1.DomainException("Transação OPENING é de uso estritamente interno da carteira.");
        }
        const tx = new WagerTransaction(props.id, props.providerId, props.externalTransactionId, props.idempotencyKey, props.payloadHash, props.walletId, props.playerId, props.roundId, props.gameId, props.kind, props.money, props.referenceExternalTransactionId, props.createdAt ?? new Date(), wager_transaction_status_1.WagerTransactionStatus.Pending);
        if (tx.requiresReference() && !tx.referenceExternalTransactionId) {
            throw new domain_exception_1.DomainException(`A operação ${props.kind} exige referenceExternalTransactionId.`);
        }
        return tx;
    }
    static rehydrate(state) {
        return new WagerTransaction(state.id, state.providerId, state.externalTransactionId, state.idempotencyKey, state.payloadHash, state.walletId, state.playerId, state.roundId, state.gameId, state.kind, state.money, state.referenceExternalTransactionId, state.createdAt, state.status, state.referenceTransactionId, state.failureCode, state.processedAt);
    }
    get status() {
        return this._status;
    }
    get referenceTransactionId() {
        return this._referenceTransactionId;
    }
    get failureCode() {
        return this._failureCode;
    }
    get processedAt() {
        return this._processedAt;
    }
    markProcessed(referenceTransactionId, at = new Date()) {
        this.assertNotTerminal();
        this._status = wager_transaction_status_1.WagerTransactionStatus.Processed;
        this._referenceTransactionId = referenceTransactionId;
        this._processedAt = at;
    }
    markPendingReference() {
        this.assertNotTerminal();
        this._status = wager_transaction_status_1.WagerTransactionStatus.PendingReference;
    }
    reject(code) {
        this.assertNotTerminal();
        this._status = wager_transaction_status_1.WagerTransactionStatus.Rejected;
        this._failureCode = code;
        this._processedAt = new Date();
    }
    fail(code) {
        this.assertNotTerminal();
        this._status = wager_transaction_status_1.WagerTransactionStatus.Failed;
        this._failureCode = code;
        this._processedAt = new Date();
    }
    isTerminal() {
        return (this._status === wager_transaction_status_1.WagerTransactionStatus.Processed ||
            this._status === wager_transaction_status_1.WagerTransactionStatus.Rejected ||
            this._status === wager_transaction_status_1.WagerTransactionStatus.Failed);
    }
    affectsBalance() {
        return this.kind !== wager_transaction_kind_1.WagerTransactionKind.Loss;
    }
    requiresReference() {
        return (this.kind === wager_transaction_kind_1.WagerTransactionKind.Refund ||
            this.kind === wager_transaction_kind_1.WagerTransactionKind.Rollback);
    }
    matchesPayload(payloadHash) {
        return this.payloadHash === payloadHash;
    }
    assertNotTerminal() {
        if (this.isTerminal()) {
            throw new invalid_transaction_state_exception_1.InvalidTransactionStateException(`Transação ${this.id} está em estado terminal (${this._status}) e não pode alterar de estado.`);
        }
    }
}
exports.WagerTransaction = WagerTransaction;
//# sourceMappingURL=wager-transaction.js.map