"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxPublisher = void 0;
class OutboxPublisher {
    constructor(outboxRepository, messagePublisher, uow, queueUrl) {
        this.outboxRepository = outboxRepository;
        this.messagePublisher = messagePublisher;
        this.uow = uow;
        this.queueUrl = queueUrl;
    }
    async processPendingMessages(batchSize = 10) {
        await this.uow.transaction(async (tx) => {
            const pendingMessages = await this.outboxRepository.findPending(batchSize, tx);
            if (pendingMessages.length === 0) {
                return;
            }
            for (const message of pendingMessages) {
                try {
                    await this.messagePublisher.publish(this.queueUrl, message.payload, {
                        messageGroupId: message.aggregateId,
                        messageDeduplicationId: message.id,
                    });
                    message.markPublished(new Date());
                    await this.outboxRepository.save(message, tx);
                }
                catch (error) {
                    message.scheduleRetry(new Date());
                    await this.outboxRepository.save(message, tx);
                    console.error(`[OutboxPublisher] Erro ao publicar mensagem ${message.id}:`, error);
                }
            }
        });
    }
}
exports.OutboxPublisher = OutboxPublisher;
//# sourceMappingURL=outbox.publisher.js.map