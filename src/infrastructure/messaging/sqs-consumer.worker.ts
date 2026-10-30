import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { InboxMessageSchema as InboxMessageEntity } from '../database/entities/inbox-message.schema';

@Injectable()
export class SqsConsumerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerWorker.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly dlqUrl: string;
  private isRunning = false;

  constructor(
    private readonly em: EntityManager,
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
  ) {
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
    this.dlqUrl = process.env.SQS_DLQ_URL || `${endpoint}/000000000000/wager-transactions-dlq.fifo`;
  }

  onModuleInit() {
    this.isRunning = true;
    this.pollQueue();
  }

  onModuleDestroy() {
    this.isRunning = false;
  }

  private async pollQueue() {
    while (this.isRunning) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 5,
          AttributeNames: ['ApproximateReceiveCount' as any],
        });

        const response = await this.sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
          for (const message of response.Messages) {
            await this.handleMessage(message);
          }
        }
      } catch (error: any) {
        this.logger.error(`Error polling SQS queue: ${error.message}`, error.stack);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async handleMessage(message: any) {
    const forkEm = this.em.fork();
    const body = JSON.parse(message.Body || '{}');
    const messageId = body.messageId || message.MessageId;
    const receiveCount = parseInt(message.Attributes?.ApproximateReceiveCount || '1', 10);

    try {
      await forkEm.transactional(async (tx) => {
        const existingInbox = await tx.findOne(InboxMessageEntity as any, { messageId, consumerName: 'wager-processor' } as any);
        if (existingInbox && (existingInbox as any).processedAt) {
          this.logger.warn(`Message [${messageId}] already processed. Skipping via Inbox.`);
          return;
        }

        if (!existingInbox) {
          const newInbox = tx.create(InboxMessageEntity as any, {
            messageId,
            consumerName: 'wager-processor',
            payloadHash: JSON.stringify(body.data),
            receivedAt: new Date(),
          } as any);
          tx.persist(newInbox);
        }

        const payload = body.data;
        await this.processWagerUseCase.execute({
          providerId: payload.providerId,
          externalTransactionId: payload.externalTransactionId,
          idempotencyKey: payload.idempotencyKey,
          playerId: payload.playerId,
          walletId: payload.walletId,
          roundId: payload.roundId,
          gameId: payload.gameId,
          kind: payload.kind,
          money: payload.money,
          referenceExternalTransactionId: payload.referenceExternalTransactionId,
        }, tx);

        const inboxToUpdate = await tx.findOne(InboxMessageEntity as any, { messageId, consumerName: 'wager-processor' } as any);
        if (inboxToUpdate) {
          (inboxToUpdate as any).processedAt = new Date();
        }
      });

      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }),
      );

      this.logger.log(`SQS Message [${messageId}] processed and acked successfully.`);
    } catch (error: any) {
      this.logger.error(`Failed to process SQS Message [${messageId}] (Attempt ${receiveCount}): ${error.message}`, error.stack);

      if (receiveCount >= 3) {
        try {
          await this.sqsClient.send(
            new SendMessageCommand({
              QueueUrl: this.dlqUrl,
              MessageBody: message.Body,
              MessageGroupId: message.Attributes?.MessageGroupId || 'default',
              MessageDeduplicationId: `dlq-${messageId}-${Date.now()}`,
            }),
          );

          await this.sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );

          this.logger.warn(`Message [${messageId}] moved to DLQ after max retries.`);
        } catch (dlqError: any) {
          this.logger.error(`Failed to move message to DLQ: ${dlqError.message}`);
        }
      }
    }
  }
}