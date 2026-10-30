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
var OutboxRelayWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxRelayWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const postgresql_1 = require("@mikro-orm/postgresql");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const outbox_message_schema_1 = require("../database/entities/outbox-message.schema");
let OutboxRelayWorker = OutboxRelayWorker_1 = class OutboxRelayWorker {
    constructor(em) {
        this.em = em;
        this.logger = new common_1.Logger(OutboxRelayWorker_1.name);
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
    }
    async handleOutboxRelay() {
        const forkEm = this.em.fork();
        try {
            const pendingMessages = await forkEm.find(outbox_message_schema_1.OutboxMessageSchema, { publishedAt: null }, { limit: 20, orderBy: { occurredAt: 'ASC' } });
            if (pendingMessages.length === 0)
                return;
            for (const msg of pendingMessages) {
                try {
                    const command = new client_sqs_1.SendMessageCommand({
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
                }
                catch (error) {
                    this.logger.error(`Failed to publish outbox event [${msg.id}]: ${error.message}`, error.stack);
                }
            }
        }
        catch (error) {
            this.logger.error(`Error in OutboxRelayWorker: ${error.message}`, error.stack);
        }
    }
};
exports.OutboxRelayWorker = OutboxRelayWorker;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_SECOND),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutboxRelayWorker.prototype, "handleOutboxRelay", null);
exports.OutboxRelayWorker = OutboxRelayWorker = OutboxRelayWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [postgresql_1.EntityManager])
], OutboxRelayWorker);
//# sourceMappingURL=outbox-relay.worker.js.map