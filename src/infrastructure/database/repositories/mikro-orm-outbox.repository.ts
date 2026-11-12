import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { OutboxMessage } from "../../../domain/entities/outbox-message";
import { OutboxRepositoryPort } from "../../../application/ports/outbox.repository";
import { OutboxMessageSchema, OutboxMessageEntity } from "../entities/outbox-message.schema";

export class MikroOrmOutboxRepository implements OutboxRepositoryPort {
  constructor(private readonly globalEm: EntityManager) {}

  private getEm(tx?: unknown): EntityManager {
    return (tx as EntityManager) ?? this.globalEm;
  }

  async save(message: OutboxMessage, tx?: unknown): Promise<void> {
    const em = this.getEm(tx);
    const existing = await em.findOne(OutboxMessageSchema, { id: message.id });

    if (existing) {
      existing.attempts = message.attempts;
      existing.nextAttemptAt = message.nextAttemptAt;
      existing.publishedAt = message.publishedAt;
    } else {
      const entity: OutboxMessageEntity = {
        id: message.id,
        aggregateId: message.aggregateId,
        eventType: message.eventType,
        payload: message.payload,
        occurredAt: message.occurredAt,
        attempts: message.attempts,
        nextAttemptAt: message.nextAttemptAt,
        publishedAt: message.publishedAt,
      };
      em.persist(em.create(OutboxMessageSchema, entity));
    }
  }

  async findPending(limit: number = 50, tx?: unknown): Promise<OutboxMessage[]> {
    const em = this.getEm(tx);
    const now = new Date();

    // Usa FOR UPDATE SKIP LOCKED quando executado dentro de uma transação (ex: OutboxPublisher),
    // permitindo múltiplos publishers concorrentes sem duplicação de envio nem bloqueio mútuo.
    const entities = await em.find(
      OutboxMessageSchema,
      {
        publishedAt: null,
        attempts: { $lt: OutboxMessage.MAX_ATTEMPTS },
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      },
      {
        limit,
        orderBy: { occurredAt: "ASC" },
        ...(tx ? { lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE } : {}),
      },
    );

    return entities.map((e) =>
      OutboxMessage.rehydrate({
        id: e.id,
        aggregateId: e.aggregateId,
        eventType: e.eventType,
        payload: e.payload,
        occurredAt: e.occurredAt,
        attempts: e.attempts,
        nextAttemptAt: e.nextAttemptAt,
        publishedAt: e.publishedAt,
      }),
    );
  }

  async countPending(tx?: unknown): Promise<number> {
    const em = this.getEm(tx);
    return em.count(OutboxMessageSchema, {
      publishedAt: null,
      attempts: { $lt: OutboxMessage.MAX_ATTEMPTS },
    });
  }
}
