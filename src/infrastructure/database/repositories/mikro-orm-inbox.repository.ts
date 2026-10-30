import { EntityManager } from "@mikro-orm/postgresql";
import { InboxMessage } from "../../../domain/entities/inbox-message";
import { InboxRepositoryPort } from "../../../application/ports/inbox.repository";
import { InboxMessageSchema, InboxMessageEntity } from "../entities/inbox-message.schema";

export class MikroOrmInboxRepository implements InboxRepositoryPort {
  constructor(private readonly globalEm: EntityManager) {}

  private getEm(tx?: unknown): EntityManager {
    return (tx as EntityManager) ?? this.globalEm;
  }

  async findByConsumerAndMessageId(consumerName: string, messageId: string, tx?: unknown): Promise<InboxMessage | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(InboxMessageSchema, { consumerName, messageId });
    if (!entity) return null;

    return InboxMessage.rehydrate({
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt,
    });
  }

  async save(message: InboxMessage, tx?: unknown): Promise<void> {
    const em = this.getEm(tx);
    const existing = await em.findOne(InboxMessageSchema, { 
      messageId: message.messageId, 
      consumerName: message.consumerName 
    });

    if (existing) {
      existing.processedAt = message.processedAt;
    } else {
      const entity: InboxMessageEntity = {
        messageId: message.messageId,
        consumerName: message.consumerName,
        payloadHash: message.payloadHash,
        receivedAt: message.receivedAt,
        processedAt: message.processedAt,
      };
      em.persist(em.create(InboxMessageSchema, entity));
    }
  }
}