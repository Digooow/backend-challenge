import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { createHash } from "node:crypto";
import { ProcessWagerTransactionUseCase } from "../../../application/use-cases/process-wager-transaction.use-case";
import { InboxRepositoryPort } from "../../../application/ports/inbox.repository";
import { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";
import { InboxMessage } from "../../../domain/entities/inbox-message";
import { DomainException } from "../../../domain/exceptions/domain.exception";
import type { ProcessWagerInputDto } from "../../../application/dtos/process-wager.dto";

@Injectable()
export class WagerSqsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WagerSqsConsumer.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly dlqUrl: string;
  private readonly consumerName = "wager-transactions-consumer";
  private readonly maxReceiveCount = 3;
  private isRunning = false;
  private inFlightMessages = new Set<Promise<void>>();

  constructor(
    private readonly useCase: ProcessWagerTransactionUseCase,
    private readonly inboxRepository: InboxRepositoryPort,
    private readonly uow: UnitOfWorkPort
  ) {
    const endpoint = process.env.SQS_ENDPOINT ?? "http://localhost:4566";
    this.queueUrl =
      process.env.SQS_WAGER_QUEUE_URL ?? `${endpoint}/000000000000/wager-transactions.fifo`;
    this.dlqUrl =
      process.env.SQS_WAGER_DLQ_URL ?? `${endpoint}/000000000000/wager-transactions-dlq.fifo`;

    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION ?? "us-east-1",
      endpoint,
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

  async onModuleDestroy() {
    this.logger.log("SIGTERM/Shutdown recebido: aguardando conclusão das mensagens SQS em andamento...");
    this.isRunning = false;

    if (this.inFlightMessages.size > 0) {
      await Promise.allSettled(Array.from(this.inFlightMessages));
    }

    this.sqsClient.destroy();
    this.logger.log("Consumidor SQS encerrado com segurança.");
  }

  private async pollMessages() {
    while (this.isRunning) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 5,
          AttributeNames: ["All"],
          MessageAttributeNames: ["All"],
        });

        const response = await this.sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
          await Promise.all(
            response.Messages.map((msg) => {
              const task = this.processMessage(msg).finally(() => {
                this.inFlightMessages.delete(task);
              });
              this.inFlightMessages.add(task);
              return task;
            })
          );
        }
      } catch (error) {
        if (!this.isRunning) break;
        this.logger.error("Erro no polling do SQS", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  public async processMessage(message: any): Promise<void> {
    const { Body, ReceiptHandle, MessageId, Attributes } = message;
    const receiveCount = parseInt(Attributes?.ApproximateReceiveCount ?? "1", 10);

    try {
      const parsedBody = JSON.parse(Body);
      const envelopeId = parsedBody.messageId ?? MessageId;
      const messageType = parsedBody.type ?? parsedBody.eventType;

      // Se for um evento de integração publicado pelo Outbox na mesma fila (ex: WalletBalanceChanged),
      // fazemos ACK sem invocar o use-case de comando.
      if (
        messageType &&
        messageType !== "WagerTransactionRequested" &&
        !parsedBody.data?.externalTransactionId
      ) {
        await this.ackMessage(ReceiptHandle);
        return;
      }

      const payload: ProcessWagerInputDto = parsedBody.data ?? parsedBody;
      if (!payload || !payload.kind || !payload.walletId || !payload.providerId) {
        // Payload permanentemente malformado -> envia direto para DLQ
        await this.moveToDlq(message, envelopeId, "Invalid message payload schema");
        return;
      }

      const payloadHash = this.generatePayloadHash(payload);

      // Transação SQL única envolvendo Inbox + UseCase (Wallet, Ledger, WagerTx, Outbox)
      await this.uow.transaction(async (tx) => {
        const existingInbox = await this.inboxRepository.findByConsumerAndMessageId(
          this.consumerName,
          envelopeId,
          tx
        );

        if (existingInbox && existingInbox.isProcessed()) {
          this.logger.log(`Mensagem SQS ${envelopeId} já processada (Inbox). Ignorando redelivery.`);
          return;
        }

        const inboxMessage =
          existingInbox ??
          InboxMessage.receive({
            messageId: envelopeId,
            consumerName: this.consumerName,
            payloadHash,
            receivedAt: new Date(),
          });

        const result = await this.useCase.execute(payload, tx);

        inboxMessage.markProcessed(new Date());
        await this.inboxRepository.save(inboxMessage, tx);

        this.logger.log({
          message: "Mensagem SQS processada com sucesso",
          messageId: envelopeId,
          transactionId: result.transactionId,
          walletId: payload.walletId,
          providerId: payload.providerId,
          status: result.status,
        });
      });

      // ACK somente APÓS o commit da transação SQL
      await this.ackMessage(ReceiptHandle);
    } catch (error) {
      // Erros de domínio/negócio (ex: conflito de idempotência ou carteira inexistente) são permanentes -> DLQ ou ACK
      if (error instanceof DomainException) {
        this.logger.warn(`Erro permanente de domínio na mensagem SQS ${MessageId}: ${error.message}`);
        await this.moveToDlq(message, MessageId, error.message);
        return;
      }

      this.logger.error(
        `Erro transitório ao processar mensagem SQS ${MessageId} (tentativa ${receiveCount}/${this.maxReceiveCount})`,
        error
      );

      if (receiveCount >= this.maxReceiveCount) {
        await this.moveToDlq(message, MessageId, "Max receive count exceeded");
      } else if (ReceiptHandle) {
        // Backoff exponencial via VisibilityTimeout antes do próximo redelivery
        const backoffSeconds = Math.min(Math.pow(2, receiveCount), 60);
        try {
          await this.sqsClient.send(
            new ChangeMessageVisibilityCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle,
              VisibilityTimeout: backoffSeconds,
            })
          );
        } catch {
          // Ignora se o cliente estiver desconectado no shutdown
        }
      }
    }
  }

  private async ackMessage(receiptHandle?: string): Promise<void> {
    if (!receiptHandle) return;
    await this.sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      })
    );
  }

  private async moveToDlq(message: any, messageId: string, reason: string): Promise<void> {
    try {
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.dlqUrl,
          MessageBody: message.Body,
          MessageGroupId: message.Attributes?.MessageGroupId ?? "dlq-group",
          MessageDeduplicationId: `dlq-${messageId}`,
        })
      );
      await this.ackMessage(message.ReceiptHandle);
      this.logger.warn(`Mensagem SQS ${messageId} movida para DLQ. Motivo: ${reason}`);
    } catch (dlqError) {
      this.logger.error(`Falha ao mover mensagem ${messageId} para DLQ`, dlqError);
    }
  }

  private generatePayloadHash(payload: any): string {
    const sortedString = JSON.stringify(payload ?? {}, Object.keys(payload ?? {}).sort());
    return createHash("sha256").update(sortedString).digest("hex");
  }
}
