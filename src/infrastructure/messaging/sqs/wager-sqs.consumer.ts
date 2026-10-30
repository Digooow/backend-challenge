import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";
import { ProcessWagerTransactionUseCase } from "../../../application/use-cases/process-wager-transaction.use-case";
import { InboxRepositoryPort } from "../../../application/ports/inbox.repository";
import { UnitOfWorkPort } from "../../../application/ports/unit-of-work.port";
import { InboxMessage } from "../../../domain/entities/inbox-message"; // Ajuste o caminho se necessário
import type { ProcessWagerInputDto } from "../../../application/dtos/process-wager.dto";

@Injectable()
export class WagerSqsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WagerSqsConsumer.name);
  private readonly sqsClient: SQSClient;
  private readonly queueUrl: string;
  private readonly consumerName = "wager-transactions-consumer";
  private isRunning = false;

  constructor(
    private readonly useCase: ProcessWagerTransactionUseCase,
    private readonly inboxRepository: InboxRepositoryPort,
    private readonly uow: UnitOfWorkPort
  ) {
    this.queueUrl = process.env.SQS_WAGER_QUEUE_URL ?? "http://localhost:4566/000000000000/wager-transactions.fifo";
    this.sqsClient = new SQSClient({
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
    // Inicia o loop de polling em background
    this.pollMessages();
  }

  onModuleDestroy() {
    this.logger.log("A encerrar o consumidor SQS graciosamente...");
    this.isRunning = false;
    this.sqsClient.destroy();
  }

  private async pollMessages() {
    while (this.isRunning) {
      try {
        const command = new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // Long polling
          AttributeNames: ["All"],
          MessageAttributeNames: ["All"],
        });

        const response = await this.sqsClient.send(command);

        if (response.Messages && response.Messages.length > 0) {
          // Processa as mensagens concorrentemente
          await Promise.all(response.Messages.map((msg) => this.processMessage(msg)));
        }
      } catch (error) {
        this.logger.error("Erro no polling do SQS", error);
        // Pequena pausa antes de tentar novamente para não inundar os logs num cenário de falha de rede
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async processMessage(message: any): Promise<void> {
    const { Body, ReceiptHandle, MessageId } = message;

    try {
      const parsedBody = JSON.parse(Body);
      const payload: ProcessWagerInputDto = parsedBody.data;
      
      // O hash do payload serve para verificar divergências de idempotência
      const payloadHash = this.generatePayloadHash(payload);

      // Transação SQL que envolve o Inbox e o Processamento da Aposta
      await this.uow.transaction(async (tx) => {
        // 1. DEDUPLICAÇÃO (Inbox Pattern)
        const existingInbox = await this.inboxRepository.findByConsumerAndMessageId(this.consumerName, MessageId, tx);
        
        if (existingInbox && existingInbox.isProcessed()) {
          this.logger.log(`Mensagem SQS ${MessageId} já processada (Inbox). Ignorando...`);
          return; 
        }

        // Se não existir, criamos o registo no Inbox
        const inboxMessage = InboxMessage.receive({
          messageId: MessageId,
          consumerName: this.consumerName,
          payloadHash: payloadHash,
          receivedAt: new Date(),
        });

        // 2. PROCESSAMENTO DO CASO DE USO
        // O caso de uso processa a aposta (altera saldo, ledger e cria evento no outbox)
        // NOTA: O seu caso de uso deve receber a transação 'tx' ou utilizar o contexto transacional do MikroORM
        const result = await this.useCase.execute(payload, tx);
        
        // 3. FINALIZA O INBOX
        inboxMessage.markProcessed(new Date());
        await this.inboxRepository.save(inboxMessage, tx);
        
        this.logger.log(`Mensagem SQS ${MessageId} processada com sucesso. Status da transação: ${result.status}`);
      });

      // 4. ACKNOWLEDGE (Apagar a mensagem da fila APÓS o commit)
      await this.sqsClient.send(
        new DeleteMessageCommand({
          QueueUrl: this.queueUrl,
          ReceiptHandle: ReceiptHandle,
        })
      );

    } catch (error) {
      // Falhas não tratadas (ex: erro no banco de dados) caem aqui.
      // O SQS fará NACK (redelivery) porque não enviámos o DeleteMessageCommand.
      this.logger.error(`Erro ao processar mensagem SQS ${MessageId}`, error);
    }
  }

  private generatePayloadHash(payload: any): string {
    // Para simplificar, ordenamos as chaves e fazemos hash (poderia usar crypto.createHash)
    const sortedString = JSON.stringify(payload, Object.keys(payload).sort());
    return Buffer.from(sortedString).toString("base64");
  }
}