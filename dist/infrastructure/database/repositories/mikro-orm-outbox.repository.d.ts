import { EntityManager } from "@mikro-orm/postgresql";
import { OutboxMessage } from "../../../domain/entities/outbox-message";
import { OutboxRepositoryPort } from "../../../application/ports/outbox.repository";
export declare class MikroOrmOutboxRepository implements OutboxRepositoryPort {
    private readonly globalEm;
    constructor(globalEm: EntityManager);
    private getEm;
    save(message: OutboxMessage, tx?: unknown): Promise<void>;
    findPending(limit?: number, tx?: unknown): Promise<OutboxMessage[]>;
}
