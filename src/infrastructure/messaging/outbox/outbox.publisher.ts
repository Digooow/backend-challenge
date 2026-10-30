import { OutboxRepositoryPort } from "../../../application/ports/outbox.repository";
import { MessagePublisherPort } from "../../../application/ports/message-publisher.port";
import { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";

export class OutboxPublisher {
  constructor(
    private readonly outboxRepository: OutboxRepositoryPort,
    private readonly messagePublisher: MessagePublisherPort,
    private readonly uow: UnitOfWorkPort,
    private readonly queueUrl: string
  ) {}

  async processPendingMessages(batchSize: number = 10): Promise<void> {
    // 1. Inicia uma transação isolada para evitar conflitos entre múltiplos workers
    await this.uow.transaction(async (tx) => {
      // 2. Procura mensagens pendentes.
      // NOTA: O ideal é que o repositório utilize um lock 'SKIP LOCKED' no PostgreSQL 
      // para permitir concorrência segura entre múltiplos publishers.
      const pendingMessages = await this.outboxRepository.findPending(batchSize, tx);

      if (pendingMessages.length === 0) {
        return;
      }

      for (const message of pendingMessages) {
        try {
          // 3. Publica na fila SQS FIFO
          await this.messagePublisher.publish(this.queueUrl, message.payload, {
            messageGroupId: message.aggregateId, // Garante ordem por wallet
            messageDeduplicationId: message.id,  // Garante deduplicação no SQS FIFO
          });

          // 4. Marca como publicada (altera o estado da entidade)
          message.markPublished(new Date());
          await this.outboxRepository.save(message, tx);
          
        } catch (error) {
          // 5. Em caso de falha transitória do SQS, agenda uma nova tentativa (Backoff)
          message.scheduleRetry(new Date());
          await this.outboxRepository.save(message, tx);
          console.error(`[OutboxPublisher] Erro ao publicar mensagem ${message.id}:`, error);
        }
      }
    });
  }
}