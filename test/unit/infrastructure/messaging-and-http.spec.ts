import { describe, it, expect, mock } from "bun:test";
import { InboxMessage } from "../../../src/domain/entities/inbox-message";
import { OutboxMessage } from "../../../src/domain/entities/outbox-message";
import { WagerSqsConsumer } from "../../../src/infrastructure/messaging/sqs/wager-sqs.consumer";
import { PendingReferenceWorker } from "../../../src/infrastructure/jobs/pending-reference.worker";
import { MikroOrmWalletRepository } from "../../../src/infrastructure/database/repositories/mikro-orm-wallet.repository";
import { DomainExceptionFilter } from "../../../src/presentation/filters/domain-exception.filter";
import { DomainException } from "../../../src/domain/exceptions/domain.exception";
import { FailureCode } from "../../../src/domain/enums/failure-code";
import { MetricsService } from "../../../src/infrastructure/observability/metrics.service";
import { ReconcileWalletUseCase } from "../../../src/application/use-cases/reconcile-wallet.use-case";
import { Wallet } from "../../../src/domain/entities/wallet";
import { Money } from "../../../src/domain/value-objects/money";
import { WagerTransaction } from "../../../src/domain/entities/wager-transaction";
import { WagerTransactionKind } from "../../../src/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../../src/domain/enums/wager-transaction-status";

describe("Infrastructure, Messaging, Workers & Presentation (Unit)", () => {
  describe("InboxMessage & OutboxMessage null/undefined hydration (Seção 6.4 e 6.5)", () => {
    it("should normalize null processedAt from PostgreSQL/MikroORM to undefined in InboxMessage", () => {
      const msg = InboxMessage.rehydrate({
        consumerName: "wager-transactions-consumer",
        messageId: "msg-1",
        payloadHash: "abc",
        receivedAt: new Date(),
        processedAt: null,
      });

      expect(msg.processedAt).toBeUndefined();
      expect(msg.isProcessed()).toBe(false);

      msg.markProcessed(new Date());
      expect(msg.isProcessed()).toBe(true);
    });

    it("should normalize null publishedAt/nextAttemptAt in OutboxMessage and enforce max attempts", () => {
      const msg = OutboxMessage.rehydrate({
        id: "outbox-1",
        aggregateType: "WagerTransaction",
        aggregateId: "tx-1",
        eventType: "WagerTransactionProcessed",
        payload: { eventId: "outbox-1" },
        attempts: 0,
        nextAttemptAt: null,
        publishedAt: null,
        createdAt: new Date(),
      });

      expect(msg.isPending()).toBe(true);
      expect(msg.isDue(new Date())).toBe(true);
      expect(msg.hasExceededMaxAttempts()).toBe(false);

      for (let i = 0; i < OutboxMessage.MAX_ATTEMPTS; i++) {
        msg.scheduleRetry(new Date());
      }
      expect(msg.attempts).toBe(OutboxMessage.MAX_ATTEMPTS);
      expect(msg.hasExceededMaxAttempts()).toBe(true);
    });
  });

  describe("WagerSqsConsumer (Inbox deduplication, Outbox event filtering, DLQ & Retry)", () => {
    const createMockConsumerDeps = () => {
      const deletedHandles: string[] = [];
      const visibilityChanges: Array<{ handle: string; timeout: number }> = [];
      const dlqPublished: Array<{ queueUrl: string; body: string }> = [];
      const inboxStore = new Map<string, InboxMessage>();

      const sqsClient = {
        send: mock(async (cmd: any) => {
          const name = cmd.constructor?.name;
          if (name === "DeleteMessageCommand") {
            deletedHandles.push(cmd.input.ReceiptHandle);
          } else if (name === "ChangeMessageVisibilityCommand") {
            visibilityChanges.push({
              handle: cmd.input.ReceiptHandle,
              timeout: cmd.input.VisibilityTimeout,
            });
          } else if (name === "SendMessageCommand") {
            dlqPublished.push({
              queueUrl: cmd.input.QueueUrl,
              body: cmd.input.MessageBody,
            });
          }
          return {};
        }),
        destroy: mock(() => {}),
      } as any;

      const inboxRepo = {
        findByConsumerAndMessageId: mock(async (consumer: string, messageId: string) => {
          return inboxStore.get(`${consumer}:${messageId}`) ?? null;
        }),
        save: mock(async (msg: InboxMessage) => {
          inboxStore.set(`${msg.consumerName}:${msg.messageId}`, msg);
        }),
      };

      const uow = {
        transaction: mock(async (work: (tx: unknown) => Promise<any>) => work({})),
      };

      const metrics = new MetricsService();

      return {
        sqsClient,
        inboxRepo,
        uow,
        metrics,
        deletedHandles,
        visibilityChanges,
        dlqPublished,
        inboxStore,
      };
    };

    it("should ignore Outbox integration events (e.g. WagerTransactionProcessed) and ACK immediately without invoking useCase", async () => {
      const deps = createMockConsumerDeps();
      const useCase = { execute: mock(async () => ({})) } as any;

      const consumer = new WagerSqsConsumer(
        useCase,
        deps.inboxRepo as any,
        deps.uow as any,
        deps.metrics,
        deps.sqsClient,
      );

      await consumer.processMessage({
        MessageId: "outbox-event-1",
        ReceiptHandle: "rh-outbox-1",
        Body: JSON.stringify({
          eventId: "ev-1",
          eventType: "WagerTransactionProcessed",
          aggregateId: "tx-1",
        }),
      });

      expect(useCase.execute).not.toHaveBeenCalled();
      expect(deps.deletedHandles).toContain("rh-outbox-1");
      expect(deps.dlqPublished).toHaveLength(0);
    });

    it("should deduplicate redelivered SQS messages via Inbox and ACK without re-executing useCase (Seção 13.5)", async () => {
      const deps = createMockConsumerDeps();
      const useCase = {
        execute: mock(async () => ({
          transactionId: "tx-100",
          status: WagerTransactionStatus.Processed,
          idempotentReplay: false,
        })),
      } as any;

      const consumer = new WagerSqsConsumer(
        useCase,
        deps.inboxRepo as any,
        deps.uow as any,
        deps.metrics,
        deps.sqsClient,
      );

      const message = {
        MessageId: "sqs-msg-dup-1",
        ReceiptHandle: "rh-1",
        Body: JSON.stringify({
          providerId: "pragmatic",
          externalTransactionId: "ext-1",
          playerId: "p-1",
          walletId: "w-1",
          roundId: "r-1",
          gameId: "g-1",
          kind: "BET",
          money: { amount: "10.00", currency: "BRL" },
        }),
      };

      // Primeira entrega
      await consumer.processMessage(message);
      expect(useCase.execute).toHaveBeenCalledTimes(1);

      // Segunda entrega (redelivery após falha de ACK)
      await consumer.processMessage({ ...message, ReceiptHandle: "rh-2" });
      expect(useCase.execute).toHaveBeenCalledTimes(1);
      expect(deps.deletedHandles).toEqual(["rh-1", "rh-2"]);
      expect(deps.metrics.getMetrics().duplicatesDetected).toBe(1);
    });

    it("should route malformed JSON messages directly to DLQ and ACK original message (Seção 10.3)", async () => {
      const deps = createMockConsumerDeps();
      const useCase = { execute: mock(async () => ({})) } as any;

      const consumer = new WagerSqsConsumer(
        useCase,
        deps.inboxRepo as any,
        deps.uow as any,
        deps.metrics,
        deps.sqsClient,
      );

      await consumer.processMessage({
        MessageId: "bad-json-1",
        ReceiptHandle: "rh-bad-json",
        Body: "{invalid-json",
      });

      expect(deps.dlqPublished).toHaveLength(1);
      expect(deps.deletedHandles).toContain("rh-bad-json");
      expect(deps.metrics.getMetrics().dlqMessagesTotal).toBe(1);
    });

    it("should apply exponential backoff via ChangeMessageVisibilityCommand on transient infra failure and route to DLQ after max receives", async () => {
      const deps = createMockConsumerDeps();
      const useCase = {
        execute: mock(async () => {
          throw new Error("Connection terminated unexpectedly");
        }),
      } as any;

      const consumer = new WagerSqsConsumer(
        useCase,
        deps.inboxRepo as any,
        deps.uow as any,
        deps.metrics,
        deps.sqsClient,
      );

      const validBody = JSON.stringify({
        providerId: "pragmatic",
        externalTransactionId: "ext-transient",
        playerId: "p-1",
        walletId: "w-1",
        roundId: "r-1",
        gameId: "g-1",
        kind: "BET",
        money: { amount: "10.00", currency: "BRL" },
      });

      // Tentativa 1: falha transitória -> deve agendar backoff sem deletar mensagem
      await consumer.processMessage({
        MessageId: "transient-1",
        ReceiptHandle: "rh-transient-1",
        Attributes: { ApproximateReceiveCount: "1" },
        Body: validBody,
      });

      expect(deps.deletedHandles).toHaveLength(0);
      expect(deps.visibilityChanges).toHaveLength(1);
      expect(deps.visibilityChanges[0].timeout).toBeGreaterThan(0);
      expect(deps.metrics.getMetrics().retriesTotal).toBe(1);

      // Tentativa 3 (excedeu limite maxReceiveCount=3): deve mover para DLQ e deletar da fila principal
      await consumer.processMessage({
        MessageId: "transient-1",
        ReceiptHandle: "rh-transient-3",
        Attributes: { ApproximateReceiveCount: "3" },
        Body: validBody,
      });

      expect(deps.dlqPublished).toHaveLength(1);
      expect(deps.deletedHandles).toContain("rh-transient-3");
    });

    it("should produce distinct hashes for different nested money amounts (deep canonical hash)", () => {
      const deps = createMockConsumerDeps();
      const consumer = new WagerSqsConsumer(
        {} as any,
        deps.inboxRepo as any,
        deps.uow as any,
        deps.metrics,
        deps.sqsClient,
      );

      const h1 = consumer.generatePayloadHash({
        providerId: "p1",
        externalTransactionId: "e1",
        walletId: "w1",
        playerId: "pl1",
        roundId: "r1",
        gameId: "g1",
        kind: "BET",
        money: { amount: "10.00", currency: "BRL" },
      });
      const h2 = consumer.generatePayloadHash({
        providerId: "p1",
        externalTransactionId: "e1",
        walletId: "w1",
        playerId: "pl1",
        roundId: "r1",
        gameId: "g1",
        kind: "BET",
        money: { amount: "999.00", currency: "BRL" },
      });

      expect(h1).not.toBe(h2);
    });
  });

  describe("PendingReferenceWorker (Transactional SKIP LOCKED & Exponential Backoff)", () => {
    it("should execute inside UnitOfWork transaction with tx passed to findPendingReferences and apply backoff on unresolved items", async () => {
      const pendingTx = WagerTransaction.rehydrate({
        id: "pending-tx-1",
        idempotencyKey: "pragmatic:ref-1",
        providerId: "pragmatic",
        externalTransactionId: "ref-1",
        playerId: "p-1",
        walletId: "w-1",
        roundId: "r-1",
        gameId: "g-1",
        kind: WagerTransactionKind.Refund,
        status: WagerTransactionStatus.PendingReference,
        money: Money.from({ amount: "10.00", currency: "BRL" }),
        referenceExternalTransactionId: "missing-bet",
        payloadHash: "hash-1",
        createdAt: new Date(),
      });

      let receivedTxToken: unknown = null;
      const wagerRepo = {
        findPendingReferences: mock(async (_limit: number, tx?: unknown) => {
          receivedTxToken = tx;
          return [pendingTx];
        }),
      };
      const uow = {
        transaction: mock(async (work: (tx: unknown) => Promise<any>) => work("tx-marker")),
      };
      const useCase = {
        execute: mock(async () => ({
          transactionId: pendingTx.id,
          status: WagerTransactionStatus.PendingReference,
          idempotentReplay: false,
        })),
      };
      const metrics = new MetricsService();

      const worker = new PendingReferenceWorker(
        wagerRepo as any,
        useCase as any,
        uow as any,
        metrics,
      );

      // Primeira execução: chama useCase e agenda backoff
      await worker.handle();
      expect(receivedTxToken).toBe("tx-marker");
      expect(useCase.execute).toHaveBeenCalledTimes(1);
      expect(metrics.getMetrics().retriesTotal).toBe(1);

      // Segunda execução imediata: dentro da janela de backoff, não chama useCase novamente
      await worker.handle();
      expect(useCase.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe("Opaque Keyset Pagination Cursor (Seção 12.1)", () => {
    it("should encode and decode (createdAt, id) cursor accurately and reject tampered cursors", () => {
      const date = new Date("2026-10-29T18:00:00.000Z");
      const id = "550e8400-e29b-41d4-a716-446655440000";

      const cursor = MikroOrmWalletRepository.encodeLedgerCursor({ createdAt: date, id });
      const decoded = MikroOrmWalletRepository.decodeLedgerCursor(cursor);

      expect(decoded.createdAt.toISOString()).toBe(date.toISOString());
      expect(decoded.id).toBe(id);

      expect(() => MikroOrmWalletRepository.decodeLedgerCursor("not-valid-base64-json")).toThrow(
        DomainException,
      );
    });
  });

  describe("DomainExceptionFilter HTTP Status Mapping (Seção 12.2)", () => {
    const createMockHost = () => {
      let statusCode = 0;
      let body: any = null;
      const headers: Record<string, string> = {};

      const response = {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (code: number) => {
          statusCode = code;
          return {
            json: (payload: any) => {
              body = payload;
            },
          };
        },
      };
      const request = { url: "/wagering/transactions", method: "POST" };
      const host = {
        switchToHttp: () => ({
          getResponse: () => response,
          getRequest: () => request,
        }),
      } as any;

      return { host, getStatus: () => statusCode, getBody: () => body, headers };
    };

    it("maps VALIDATION -> 400, NOT_FOUND -> 404, CONFLICT -> 409, BUSINESS_RULE -> 422, TRANSIENT_INFRA -> 503", () => {
      const filter = new DomainExceptionFilter();

      const cases = [
        { ex: DomainException.validation("Invalid amount"), expected: 400 },
        { ex: DomainException.notFound("Wallet not found"), expected: 404 },
        { ex: DomainException.conflict("Payload mismatch", FailureCode.PayloadMismatch), expected: 409 },
        {
          ex: DomainException.businessRule("Insufficient balance", FailureCode.InsufficientBalance),
          expected: 422,
        },
        { ex: DomainException.transient("DB lock timeout"), expected: 503 },
      ];

      for (const c of cases) {
        const mockHost = createMockHost();
        filter.catch(c.ex, mockHost.host);
        expect(mockHost.getStatus()).toBe(c.expected);
      }
    });
  });

  describe("ReconcileWalletUseCase & MetricsService (Seção 9 e 11.2)", () => {
    it("detects ledger discrepancy using O(1) SQL summary and increments reconciliationDiscrepanciesTotal", async () => {
      const metrics = new MetricsService();
      const { wallet } = Wallet.open({
        id: "w-recon-1",
        playerId: "p-recon-1",
        initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
      });

      const walletRepo = {
        findById: mock(async () => wallet),
        calculateLedgerSummary: mock(async () => ({
          calculatedBalance: Money.from({ amount: "80.00", currency: "BRL" }),
          entriesCount: 2,
        })),
      };

      const reconcileUseCase = new ReconcileWalletUseCase(walletRepo as any, metrics);
      const result = await reconcileUseCase.execute("w-recon-1");

      expect(result.consistent).toBe(false);
      expect(result.storedBalance.amount).toBe("100.00");
      expect(result.calculatedBalance.amount).toBe("80.00");
      expect(result.difference.amount).toBe("20.00");
      expect(metrics.getMetrics().reconciliationDiscrepanciesTotal).toBe(1);
    });

    it("computes p50, p95, p99 latencies and formats Prometheus exposition output", () => {
      const metrics = new MetricsService();
      for (let i = 1; i <= 100; i++) {
        metrics.recordLatency(i);
      }
      metrics.incrementTransaction("PROCESSED");
      metrics.incrementDuplicate();
      metrics.incrementLockConflict();

      const snap = metrics.getMetrics();
      expect(snap.p50LatencyMs).toBe(50);
      expect(snap.p95LatencyMs).toBe(95);
      expect(snap.p99LatencyMs).toBe(99);

      const prom = metrics.toPrometheus();
      expect(prom).toContain('wager_transactions_total{status="PROCESSED"} 1');
      expect(prom).toContain("wager_duplicates_detected_total 1");
      expect(prom).toContain("wager_lock_conflicts_total 1");
    });
  });
});
