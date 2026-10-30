import { OutboxPublisher } from "../messaging/outbox/outbox.publisher";
export declare class OutboxRelayWorker {
    private readonly outboxPublisher;
    private readonly logger;
    private isProcessing;
    constructor(outboxPublisher: OutboxPublisher);
    handle(): Promise<void>;
}
