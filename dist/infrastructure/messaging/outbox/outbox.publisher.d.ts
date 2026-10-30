import { OutboxRepositoryPort } from "../../../application/ports/outbox.repository";
import { MessagePublisherPort } from "../../../application/ports/message-publisher.port";
import { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";
export declare class OutboxPublisher {
    private readonly outboxRepository;
    private readonly messagePublisher;
    private readonly uow;
    private readonly queueUrl;
    constructor(outboxRepository: OutboxRepositoryPort, messagePublisher: MessagePublisherPort, uow: UnitOfWorkPort, queueUrl: string);
    processPendingMessages(batchSize?: number): Promise<void>;
}
