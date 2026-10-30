import { MessagePublisherPort, PublishOptions } from "../../../application/ports/message-publisher.port";
export declare class LocalstackSqsClient implements MessagePublisherPort {
    private readonly sqs;
    constructor();
    publish(queueUrl: string, payload: Record<string, unknown>, options?: PublishOptions): Promise<void>;
}
