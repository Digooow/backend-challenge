import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { MessagePublisherPort, PublishOptions } from "../../../application/ports/message-publisher.port";

export class LocalstackSqsClient implements MessagePublisherPort {
  private readonly sqs: SQSClient;

  constructor() {
    this.sqs = new SQSClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
      },
    });
  }

  async publish(queueUrl: string, payload: Record<string, unknown>, options?: PublishOptions): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload),
      MessageGroupId: options?.messageGroupId,
      MessageDeduplicationId: options?.messageDeduplicationId,
    });

    await this.sqs.send(command);
  }
}