"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmWagerTransactionRepository = void 0;
const wager_transaction_1 = require("../../../domain/entities/wager-transaction");
const money_1 = require("../../../domain/value-objects/money");
const wager_transaction_schema_1 = require("../entities/wager-transaction.schema");
class MikroOrmWagerTransactionRepository {
    constructor(globalEm) {
        this.globalEm = globalEm;
    }
    getEm(tx) {
        return tx ?? this.globalEm;
    }
    async findById(id, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(wager_transaction_schema_1.WagerTransactionSchema, { id });
        if (!entity)
            return null;
        return this.toDomain(entity);
    }
    async findByIdempotencyKey(key, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(wager_transaction_schema_1.WagerTransactionSchema, { idempotencyKey: key });
        if (!entity)
            return null;
        return this.toDomain(entity);
    }
    async findByProviderAndExternalId(providerId, externalTransactionId, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(wager_transaction_schema_1.WagerTransactionSchema, { providerId, externalTransactionId });
        if (!entity)
            return null;
        return this.toDomain(entity);
    }
    async save(transaction, tx) {
        const em = this.getEm(tx);
        const existing = await em.findOne(wager_transaction_schema_1.WagerTransactionSchema, { id: transaction.id });
        if (existing) {
            existing.status = transaction.status;
            existing.referenceTransactionId = transaction.referenceTransactionId;
            existing.failureCode = transaction.failureCode;
            existing.processedAt = transaction.processedAt;
        }
        else {
            const entity = {
                id: transaction.id,
                providerId: transaction.providerId,
                externalTransactionId: transaction.externalTransactionId,
                idempotencyKey: transaction.idempotencyKey,
                payloadHash: transaction.payloadHash,
                walletId: transaction.walletId,
                playerId: transaction.playerId,
                roundId: transaction.roundId,
                gameId: transaction.gameId,
                kind: transaction.kind,
                amount: transaction.money.toString(),
                currency: transaction.money.currency,
                referenceExternalTransactionId: transaction.referenceExternalTransactionId,
                createdAt: transaction.createdAt,
                status: transaction.status,
                referenceTransactionId: transaction.referenceTransactionId,
                failureCode: transaction.failureCode,
                processedAt: transaction.processedAt,
            };
            em.persist(em.create(wager_transaction_schema_1.WagerTransactionSchema, entity));
        }
    }
    async findPendingReferences(limit, tx) {
        const em = this.getEm(tx);
        const entities = await em.find(wager_transaction_schema_1.WagerTransactionSchema, { status: 'PENDING_REFERENCE' }, { limit, orderBy: { createdAt: 'ASC' } });
        return entities.map(e => this.toDomain(e));
    }
    toDomain(entity) {
        return wager_transaction_1.WagerTransaction.rehydrate({
            id: entity.id,
            providerId: entity.providerId,
            externalTransactionId: entity.externalTransactionId,
            idempotencyKey: entity.idempotencyKey,
            payloadHash: entity.payloadHash,
            walletId: entity.walletId,
            playerId: entity.playerId,
            roundId: entity.roundId,
            gameId: entity.gameId,
            kind: entity.kind,
            money: money_1.Money.from({ amount: entity.amount, currency: entity.currency }),
            referenceExternalTransactionId: entity.referenceExternalTransactionId,
            createdAt: entity.createdAt,
            status: entity.status,
            referenceTransactionId: entity.referenceTransactionId,
            failureCode: entity.failureCode,
            processedAt: entity.processedAt,
        });
    }
}
exports.MikroOrmWagerTransactionRepository = MikroOrmWagerTransactionRepository;
//# sourceMappingURL=mikro-orm-wager-transaction.repository.js.map