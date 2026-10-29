import { EntityManager } from "@mikro-orm/postgresql";
import { WagerTransaction } from "../../../domain/entities/wager-transaction";
import { Money } from "../../../domain/value-objects/money";
import { WagerTransactionRepositoryPort } from "../../../application/ports/wager-transaction.repository";
import { WagerTransactionSchema, WagerTransactionEntity } from "../entities/wager-transaction.schema";

export class MikroOrmWagerTransactionRepository implements WagerTransactionRepositoryPort {
  constructor(private readonly globalEm: EntityManager) {}

  private getEm(tx?: unknown): EntityManager {
    return (tx as EntityManager) ?? this.globalEm;
  }

  async findById(id: string, tx?: unknown): Promise<WagerTransaction | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(WagerTransactionSchema, { id });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByIdempotencyKey(key: string, tx?: unknown): Promise<WagerTransaction | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(WagerTransactionSchema, { idempotencyKey: key });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async findByProviderAndExternalId(providerId: string, externalTransactionId: string, tx?: unknown): Promise<WagerTransaction | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(WagerTransactionSchema, { providerId, externalTransactionId });
    if (!entity) return null;
    return this.toDomain(entity);
  }

  async save(transaction: WagerTransaction, tx?: unknown): Promise<void> {
    const em = this.getEm(tx);
    const existing = await em.findOne(WagerTransactionSchema, { id: transaction.id });

    if (existing) {
      existing.status = transaction.status;
      existing.referenceTransactionId = transaction.referenceTransactionId;
      existing.failureCode = transaction.failureCode;
      existing.processedAt = transaction.processedAt;
    } else {
      const entity: WagerTransactionEntity = {
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
      em.persist(em.create(WagerTransactionSchema, entity));
    }
  }

  private toDomain(entity: WagerTransactionEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
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
      money: Money.from({ amount: entity.amount, currency: entity.currency }),
      referenceExternalTransactionId: entity.referenceExternalTransactionId,
      createdAt: entity.createdAt,
      status: entity.status,
      referenceTransactionId: entity.referenceTransactionId,
      failureCode: entity.failureCode,
      processedAt: entity.processedAt,
    });
  }
}