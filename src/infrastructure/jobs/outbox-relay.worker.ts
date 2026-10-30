import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OutboxPublisher } from "../messaging/outbox/outbox.publisher";

@Injectable()
export class OutboxRelayWorker {
  private readonly logger = new Logger(OutboxRelayWorker.name);
  private isProcessing = false;

  constructor(private readonly outboxPublisher: OutboxPublisher) {}

  // Executa a cada 5 segundos
  @Cron(CronExpression.EVERY_5_SECONDS)
  async handle() {
    // Evita sobreposição se a execução anterior ainda estiver a processar
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.outboxPublisher.processPendingMessages(20);
    } catch (error) {
      this.logger.error("Erro fatal durante o Outbox Relay", error);
    } finally {
      this.isProcessing = false;
    }
  }
}