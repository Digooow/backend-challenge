import { InboxMessage } from "../../domain/entities/inbox-message";
export interface InboxRepositoryPort {
    findByConsumerAndMessageId(consumerName: string, messageId: string, tx?: unknown): Promise<InboxMessage | null>;
    save(message: InboxMessage, tx?: unknown): Promise<void>;
}
