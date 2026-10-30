import { EntityManager } from "@mikro-orm/postgresql";
import { InboxMessage } from "../../../domain/entities/inbox-message";
import { InboxRepositoryPort } from "../../../application/ports/inbox.repository";
export declare class MikroOrmInboxRepository implements InboxRepositoryPort {
    private readonly globalEm;
    constructor(globalEm: EntityManager);
    private getEm;
    findByConsumerAndMessageId(consumerName: string, messageId: string, tx?: unknown): Promise<InboxMessage | null>;
    save(message: InboxMessage, tx?: unknown): Promise<void>;
}
