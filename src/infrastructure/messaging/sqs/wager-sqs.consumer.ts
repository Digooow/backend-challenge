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
import type { InboxRepositoryPort } from "../../../application/ports/inbox.repository";
import type { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";
import { InboxMessage } from "../../../domain/entities/inbox-message";
import { DomainException } from "../../../domain/exceptions/domain.exception";
import type { ProcessWagerInputDto } from "../../../application/dtos/process-wager.dto";
import { MetricsService } from "../../observability/metrics.service";
import { RequestContext } from "../../observability/request-context";

@Injectable()
export class WagerSqsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WagerSqsConsumer.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly dlqUrl: string;
  private readonly consumerName = "wager-transactions-consumer";
  private readonly maxReceiveCount = 3;
  private isRunning = false;
  private inFlightMessages = new Map<Promise<void>, string | undefined>();
  private pollingLoopPromise?: Promise<void>;

  constructor(
    private readonly useCase: ProcessWagerTransactionUseCase,
    private readonly inboxRepository: InboxRepositoryPort,
    private readonly uow: UnitOfWorkPort,
    private readonly metricsService?: MetricsService,
    customSqsClient?: SQSClient,
  ) {
    const endpoint = process.env.SQS_ENDPOINT ?? "http://localhost:4566";
    this.queueUrl =
      process.env.SQS_WAGER_QUEUE_URL ?? `${endpoint}/000000000000/wager-transactions.fifo`;
    this.dlqUrl =
      process.env.SQS_WAGER_DLQ_URL ?? `${endpoint}/000000000000/wager-transactions-dlq.fifo`;

    this.sqsClient =
      customSqsClient ??
      new SQSClient({
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
    this.pollingLoopPromise = this.pollMessages();
  }

  async onModuleDestroy() {
    this.logger.log(
      "SIGTERM/Shutdown recebido: aguardando conclusão das mensagens SQS em andamento...",
    );
    this.isRunning = false;

    if (this.inFlightMessages.size > 0) {
      const timeoutMs = 4000;
      const allDone = Promise.allSettled(Array.from(this.inFlightMessages.keys()));
      const timedOut = await Promise.race([
        allDone.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), timeoutMs)),
      ]);

      // Se ainda houver mensagens em andamento após o timeout de shutdown, devolve a visibilidade imediatamente (Seção 10)
      if (timedOut && this.inFlightMessages.size > 0) {
        await Promise.allSettled(
          Array.from(this.inFlightMessages.values()).map((receiptHandle) => {
            if (!receiptHandle) return Promise.resolve();
            return this.sqsClient.send(
              new ChangeMessageVisibilityCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: receiptHandle,
                VisibilityTimeout: 0,
              }),
            );
          }),
        );
      }
    }

    if (this.pollingLoopPromise) {
      await Promise.race([
        this.pollingLoopPromise.catch(() => {}),
        new Promise((r) => setTimeout(r, 1000)),
      ]);
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
          WaitTimeSeconds: 2,
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
              this.inFlightMessages.set(task, msg.ReceiptHandle);
              return task;
            }),
          );
        }
      } catch (error) {
        if (!this.isRunning) break;
        this.logger.error("Erro no polling do SQS", error);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  public async processMessage(message: any): Promise<void> {
    const { Body, ReceiptHandle, MessageId, Attributes } = message;
    const receiveCount = parseInt(Attributes?.ApproximateReceiveCount ?? "1", 10);

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(Body);
    } catch {
      await this.moveToDlq(message, MessageId ?? crypto.randomUUID(), "Malformed JSON body");
      return;
    }

    const envelopeId = parsedBody.messageId ?? parsedBody.eventId ?? MessageId ?? crypto.randomUUID();
    const messageType = parsedBody.type ?? parsedBody.eventType;

    // Eventos de integração publicados pelo Outbox (ex: WalletBalanceChanged, WagerTransactionProcessed,
    // WagerTransactionRejected, WagerTransactionPendingReference) possuem eventType diferente de WagerTransactionRequested.
    // Fazemos ACK sem reprocessar como comando de entrada para evitar loop infinito e falso envio à DLQ.
    if (messageType && messageType !== "WagerTransactionRequested") {
      await this.ackMessage(ReceiptHandle);
      return;
    }

    const payload: ProcessWagerInputDto = parsedBody.data ?? parsedBody;
    if (
      !payload ||
      !payload.kind ||
      !payload.walletId ||
      !payload.providerId ||
      !payload.externalTransactionId ||
      !payload.money
    ) {
      await this.moveToDlq(message, envelopeId, "Invalid message payload schema");
      return;
    }

    const correlationId =
      parsedBody.correlationId ?? payload.correlationId ?? envelopeId;

    await RequestContext.run(
      {
        correlationId,
        messageId: envelopeId,
        walletId: payload.walletId,
        providerId: payload.providerId,
      },
      async () => {
        try {
          const payloadHash = this.generatePayloadHash(payload);

          // Transação SQL única envolvendo Inbox + UseCase (Wallet, Ledger, WagerTx, Outbox)
          await this.uow.transaction(async (tx) => {
            const existingInbox = await this.inboxRepository.findByConsumerAndMessageId(
              this.consumerName,
              envelopeId,
              tx,
            );

            if (existingInbox && existingInbox.isProcessed()) {
              this.metricsService?.incrementDuplicate();
              this.logger.log({
                message: "Mensagem SQS já processada via Inbox. Ignorando redelivery.",
                messageId: envelopeId,
              });
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

            const result = await this.useCase.execute(
              { ...payload, correlationId },
              tx,
            );

            inboxMessage.markProcessed(new Date());
            await this.inboxRepository.save(inboxMessage, tx);

            RequestContext.merge({ transactionId: result.transactionId });

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
          // Erros de domínio/validação/conflito permanentes -> DLQ imediata
          if (error instanceof DomainException && error.category !== "TRANSIENT_INFRA") {
            this.logger.warn({
              message: `Erro permanente de domínio na mensagem SQS ${envelopeId}: ${error.message}`,
              messageId: envelopeId,
              code: error.code,
            });
            await this.moveToDlq(message, envelopeId, error.message);
            return;
          }

          this.metricsService?.incrementRetry();
          this.logger.error(
            `Erro transitório ao processar mensagem SQS ${envelopeId} (tentativa ${receiveCount}/${this.maxReceiveCount})`,
            error,
          );

          if (receiveCount >= this.maxReceiveCount) {
            await this.moveToDlq(message, envelopeId, "Max receive count exceeded");
          } else if (ReceiptHandle) {
            // Backoff exponencial via VisibilityTimeout antes do próximo redelivery
            const backoffSeconds = Math.min(Math.pow(2, receiveCount), 60);
            try {
              await this.sqsClient.send(
                new ChangeMessageVisibilityCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle,
                  VisibilityTimeout: backoffSeconds,
                }),
              );
            } catch {
              // Ignora se o cliente estiver desconectado no shutdown
            }
          }
        }
      },
    );
  }

  private async ackMessage(receiptHandle?: string): Promise<void> {
    if (!receiptHandle) return;
    await this.sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  private async moveToDlq(message: any, messageId: string, reason: string): Promise<void> {
    try {
      this.metricsService?.incrementDlq();
      await this.sqsClient.send(
        new SendMessageCommand({
          QueueUrl: this.dlqUrl,
          MessageBody: message.Body,
          MessageGroupId: message.Attributes?.MessageGroupId ?? "dlq-group",
          MessageDeduplicationId: `dlq-${messageId}`,
        }),
      );
      await this.ackMessage(message.ReceiptHandle);
      this.logger.warn({
        message: `Mensagem SQS ${messageId} movida para DLQ`,
        messageId,
        reason,
      });
    } catch (dlqError) {
      this.logger.error(`Falha ao mover mensagem ${messageId} para DLQ`, dlqError);
    }
  }

  public generatePayloadHash(payload: any): string {
    const canonicalObject = {
      externalTransactionId: payload?.externalTransactionId ?? null,
      gameId: payload?.gameId ?? null,
      kind: payload?.kind ?? null,
      money: {
        amount: payload?.money?.amount ?? null,
        currency: payload?.money?.currency ?? null,
      },
      playerId: payload?.playerId ?? null,
      providerId: payload?.providerId ?? null,
      referenceExternalTransactionId: payload?.referenceExternalTransactionId ?? null,
      roundId: payload?.roundId ?? null,
      walletId: payload?.walletId ?? null,
    };
    return createHash("sha256").update(JSON.stringify(canonicalObject)).digest("hex");
  }
}
