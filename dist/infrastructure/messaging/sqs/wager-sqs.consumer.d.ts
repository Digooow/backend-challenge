import { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ProcessWagerTransactionUseCase } from "../../../application/use-cases/process-wager-transaction.use-case";
import { InboxRepositoryPort } from "../../../application/ports/inbox.repository";
import { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";
export declare class WagerSqsConsumer implements OnModuleInit, OnModuleDestroy {
    private readonly useCase;
    private readonly inboxRepository;
    private readonly uow;
    private readonly logger;
    private readonly sqsClient;
    private readonly queueUrl;
    private readonly consumerName;
    private isRunning;
    constructor(useCase: ProcessWagerTransactionUseCase, inboxRepository: InboxRepositoryPort, uow: UnitOfWorkPort);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): void;
    private pollMessages;
    private processMessage;
    private generatePayloadHash;
}
