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
var WagerSqsConsumer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WagerSqsConsumer = void 0;
const common_1 = require("@nestjs/common");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const process_wager_transaction_use_case_1 = require("../../../application/use-cases/process-wager-transaction.use-case");
const inbox_message_1 = require("../../../domain/entities/inbox-message");
let WagerSqsConsumer = WagerSqsConsumer_1 = class WagerSqsConsumer {
    constructor(useCase, inboxRepository, uow) {
        this.useCase = useCase;
        this.inboxRepository = inboxRepository;
        this.uow = uow;
        this.logger = new common_1.Logger(WagerSqsConsumer_1.name);
        this.consumerName = "wager-transactions-consumer";
        this.isRunning = false;
        this.queueUrl = process.env.SQS_WAGER_QUEUE_URL ?? "http://localhost:4566/000000000000/wager-transactions.fifo";
        this.sqsClient = new client_sqs_1.SQSClient({
            region: process.env.AWS_REGION ?? "us-east-1",
            endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
            },
        });
    }
    async onModuleInit() {
        this.isRunning = true;
        this.logger.log(`A iniciar o consumidor SQS em ${this.queueUrl}`);
        this.pollMessages();
    }
    onModuleDestroy() {
        this.logger.log("A encerrar o consumidor SQS graciosamente...");
        this.isRunning = false;
        this.sqsClient.destroy();
    }
    async pollMessages() {
        while (this.isRunning) {
            try {
                const command = new client_sqs_1.ReceiveMessageCommand({
                    QueueUrl: this.queueUrl,
                    MaxNumberOfMessages: 10,
                    WaitTimeSeconds: 20,
                    AttributeNames: ["All"],
                    MessageAttributeNames: ["All"],
                });
                const response = await this.sqsClient.send(command);
                if (response.Messages && response.Messages.length > 0) {
                    await Promise.all(response.Messages.map((msg) => this.processMessage(msg)));
                }
            }
            catch (error) {
                this.logger.error("Erro no polling do SQS", error);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }
    async processMessage(message) {
        const { Body, ReceiptHandle, MessageId } = message;
        try {
            const parsedBody = JSON.parse(Body);
            const payload = parsedBody.data;
            const payloadHash = this.generatePayloadHash(payload);
            await this.uow.transaction(async (tx) => {
                const existingInbox = await this.inboxRepository.findByConsumerAndMessageId(this.consumerName, MessageId, tx);
                if (existingInbox && existingInbox.isProcessed()) {
                    this.logger.log(`Mensagem SQS ${MessageId} já processada (Inbox). Ignorando...`);
                    return;
                }
                const inboxMessage = inbox_message_1.InboxMessage.receive({
                    messageId: MessageId,
                    consumerName: this.consumerName,
                    payloadHash: payloadHash,
                    receivedAt: new Date(),
                });
                const result = await this.useCase.execute(payload, tx);
                inboxMessage.markProcessed(new Date());
                await this.inboxRepository.save(inboxMessage, tx);
                this.logger.log(`Mensagem SQS ${MessageId} processada com sucesso. Status da transação: ${result.status}`);
            });
            await this.sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: ReceiptHandle,
            }));
        }
        catch (error) {
            this.logger.error(`Erro ao processar mensagem SQS ${MessageId}`, error);
        }
    }
    generatePayloadHash(payload) {
        const sortedString = JSON.stringify(payload, Object.keys(payload).sort());
        return Buffer.from(sortedString).toString("base64");
    }
};
exports.WagerSqsConsumer = WagerSqsConsumer;
exports.WagerSqsConsumer = WagerSqsConsumer = WagerSqsConsumer_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase, Object, Object])
], WagerSqsConsumer);
//# sourceMappingURL=wager-sqs.consumer.js.map