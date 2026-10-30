import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/postgresql';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
// Importa o schema como valor/classe real
import { OutboxMessageSchema as OutboxMessageEntity } from '../database/entities/outbox-message.schema';

@Injectable()
export class OutboxRelayWorker {
  private readonly logger = new Logger(OutboxRelayWorker.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;

  constructor(private readonly em: EntityManager) {
    const endpoint = process.env.SQS_ENDPOINT || 'http://localhost:4566';
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });
    this.queueUrl = process.env.SQS_QUEUE_URL || `${endpoint}/000000000000/wager-transactions.fifo`;
  }

  @Cron(CronExpression.EVERY_SECOND)
  async handleOutboxRelay() {
    const forkEm = this.em.fork();

    try {
      const pendingMessages = await forkEm.find(
        OutboxMessageEntity as any,
        { publishedAt: null } as any,
        { limit: 20, orderBy: { occurredAt: 'ASC' } as any }
      );

      if (pendingMessages.length === 0) return;

      for (const msg of (pendingMessages as any[])) {
        try {
          const command = new SendMessageCommand({
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify({
              messageId: msg.id,
              type: msg.eventType,
              occurredAt: msg.occurredAt,
              data: msg.payload,
            }),
            MessageGroupId: msg.aggregateId,
            MessageDeduplicationId: msg.id,
          });

          await this.sqsClient.send(command);

          msg.publishedAt = new Date();
          await forkEm.flush();

          this.logger.log(`Outbox event [${msg.eventType}] published successfully for aggregate [${msg.aggregateId}]`);
        } catch (error: any) {
          this.logger.error(`Failed to publish outbox event [${msg.id}]: ${error.message}`, error.stack);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in OutboxRelayWorker: ${error.message}`, error.stack);
    }
  }
}