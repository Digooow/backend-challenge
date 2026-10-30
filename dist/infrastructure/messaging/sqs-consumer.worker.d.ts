import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
export declare class SqsConsumerWorker implements OnModuleInit, OnModuleDestroy {
    private readonly em;
    private readonly processWagerUseCase;
    private readonly logger;
    private readonly sqsClient;
    private readonly queueUrl;
    private readonly dlqUrl;
    private isRunning;
    constructor(em: EntityManager, processWagerUseCase: ProcessWagerTransactionUseCase);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private pollQueue;
    private handleMessage;
}
