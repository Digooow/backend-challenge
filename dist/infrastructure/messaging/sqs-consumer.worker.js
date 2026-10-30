"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SqsConsumerWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqsConsumerWorker = void 0;
const common_1 = require("@nestjs/common");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const postgresql_1 = require("@mikro-orm/postgresql");
const process_wager_transaction_use_case_1 = require("../../application/use-cases/process-wager-transaction.use-case");
const inbox_message_schema_1 = require("../database/entities/inbox-message.schema");
let SqsConsumerWorker = SqsConsumerWorker_1 = class SqsConsumerWorker {
    constructor(em, processWagerUseCase) {
        this.em = em;
        this.processWagerUseCase = processWagerUseCase;
        this.logger = new common_1.Logger(SqsConsumerWorker_1.name);
        this.isRunning = false;
        const endpoint = process.env.SQS_ENDPOINT || 'http://localhost:4566';
        this.sqsClient = new client_sqs_1.SQSClient({
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
    async pollQueue() {
        while (this.isRunning) {
            try {
                const command = new client_sqs_1.ReceiveMessageCommand({
                    QueueUrl: this.queueUrl,
                    MaxNumberOfMessages: 5,
                    WaitTimeSeconds: 5,
                    AttributeNames: ['ApproximateReceiveCount'],
                });
                const response = await this.sqsClient.send(command);
                if (response.Messages && response.Messages.length > 0) {
                    for (const message of response.Messages) {
                        await this.handleMessage(message);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error polling SQS queue: ${error.message}`, error.stack);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }
    async handleMessage(message) {
        const forkEm = this.em.fork();
        const body = JSON.parse(message.Body || '{}');
        const messageId = body.messageId || message.MessageId;
        const receiveCount = parseInt(message.Attributes?.ApproximateReceiveCount || '1', 10);
        try {
            await forkEm.transactional(async (tx) => {
                const existingInbox = await tx.findOne(inbox_message_schema_1.InboxMessageSchema, { messageId, consumerName: 'wager-processor' });
                if (existingInbox && existingInbox.processedAt) {
                    this.logger.warn(`Message [${messageId}] already processed. Skipping via Inbox.`);
                    return;
                }
                if (!existingInbox) {
                    const newInbox = tx.create(inbox_message_schema_1.InboxMessageSchema, {
                        messageId,
                        consumerName: 'wager-processor',
                        payloadHash: JSON.stringify(body.data),
                        receivedAt: new Date(),
                    });
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
                const inboxToUpdate = await tx.findOne(inbox_message_schema_1.InboxMessageSchema, { messageId, consumerName: 'wager-processor' });
                if (inboxToUpdate) {
                    inboxToUpdate.processedAt = new Date();
                }
            });
            await this.sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
            }));
            this.logger.log(`SQS Message [${messageId}] processed and acked successfully.`);
        }
        catch (error) {
            this.logger.error(`Failed to process SQS Message [${messageId}] (Attempt ${receiveCount}): ${error.message}`, error.stack);
            if (receiveCount >= 3) {
                try {
                    await this.sqsClient.send(new client_sqs_1.SendMessageCommand({
                        QueueUrl: this.dlqUrl,
                        MessageBody: message.Body,
                        MessageGroupId: message.Attributes?.MessageGroupId || 'default',
                        MessageDeduplicationId: `dlq-${messageId}-${Date.now()}`,
                    }));
                    await this.sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                        QueueUrl: this.queueUrl,
                        ReceiptHandle: message.ReceiptHandle,
                    }));
                    this.logger.warn(`Message [${messageId}] moved to DLQ after max retries.`);
                }
                catch (dlqError) {
                    this.logger.error(`Failed to move message to DLQ: ${dlqError.message}`);
                }
            }
        }
    }
};
exports.SqsConsumerWorker = SqsConsumerWorker;
exports.SqsConsumerWorker = SqsConsumerWorker = SqsConsumerWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [postgresql_1.EntityManager,
        process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase])
], SqsConsumerWorker);
//# sourceMappingURL=sqs-consumer.worker.js.map