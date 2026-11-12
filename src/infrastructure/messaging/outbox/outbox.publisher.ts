import { Logger } from "@nestjs/common";
import { OutboxRepositoryPort } from "../../../application/ports/outbox.repository";
import { MessagePublisherPort } from "../../../application/ports/message-publisher.port";
import { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";
import { MetricsService } from "../../observability/metrics.service";
import { RequestContext } from "../../observability/request-context";

export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(
    private readonly outboxRepository: OutboxRepositoryPort,
    private readonly messagePublisher: MessagePublisherPort,
    private readonly uow: UnitOfWorkPort,
    private readonly queueUrl: string,
    private readonly metricsService?: MetricsService,
  ) {}

  async processPendingMessages(batchSize: number = 20): Promise<void> {
    await this.uow.transaction(async (tx) => {
      // Utiliza FOR UPDATE SKIP LOCKED no PostgreSQL para concorrência segura entre múltiplos publishers
      const pendingMessages = await this.outboxRepository.findPending(batchSize, tx);

      if (pendingMessages.length === 0) {
        if (this.outboxRepository.countPending) {
          const remaining = await this.outboxRepository.countPending(tx);
          this.metricsService?.setOutboxLag(remaining);
        }
        return;
      }

      for (const message of pendingMessages) {
        const correlationId = String(message.payload?.correlationId ?? message.id);
        await RequestContext.run(
          {
            correlationId,
            messageId: message.id,
            walletId: message.aggregateId,
          },
          async () => {
            try {
              await this.messagePublisher.publish(this.queueUrl, message.payload, {
                messageGroupId: message.aggregateId,
                messageDeduplicationId: message.id,
              });

              message.markPublished(new Date());
              await this.outboxRepository.save(message, tx);
            } catch (error) {
              message.scheduleRetry(new Date());
              this.metricsService?.incrementRetry();
              await this.outboxRepository.save(message, tx);
              this.logger.error(
                `Falha ao publicar mensagem Outbox ${message.id} (tentativa ${message.attempts})`,
                error,
              );
            }
          },
        );
      }

      if (this.outboxRepository.countPending) {
        const remaining = await this.outboxRepository.countPending(tx);
        this.metricsService?.setOutboxLag(remaining);
      }
    });
  }
}