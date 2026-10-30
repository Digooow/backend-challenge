import { EntityManager } from '@mikro-orm/postgresql';
export declare class OutboxRelayWorker {
    private readonly em;
    private readonly logger;
    private readonly sqsClient;
    private readonly queueUrl;
    constructor(em: EntityManager);
    handleOutboxRelay(): Promise<void>;
}
