import { OutboxMessage } from "../../domain/entities/outbox-message";

export interface OutboxRepositoryPort {
  save(message: OutboxMessage, tx?: unknown): Promise<void>;
  findPending(limit: number, tx?: unknown): Promise<OutboxMessage[]>;
}