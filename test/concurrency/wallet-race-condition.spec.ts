import { describe, it, beforeAll, afterAll, expect, mock } from "bun:test";
import { EntityManager } from "@mikro-orm/postgresql";

import { setupTestDb, teardownTestDb } from "../setup/setup-test-db";
import { ProcessWagerTransactionUseCase } from "../../src/application/use-cases/process-wager-transaction.use-case";
import { ReconcileWalletUseCase } from "../../src/application/use-cases/reconcile-wallet.use-case";
import type { ProcessWagerInputDto } from "../../src/application/dtos/process-wager.dto";

import { MikroOrmWalletRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wallet.repository";
import { MikroOrmWagerTransactionRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository";
import { MikroOrmOutboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-outbox.repository";
import { MikroOrmInboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-inbox.repository";
import { MikroOrmUnitOfWork } from "../../src/infrastructure/database/unit-of-work";
import { OutboxPublisher } from "../../src/infrastructure/messaging/outbox/outbox.publisher";
import { PendingReferenceWorker } from "../../src/infrastructure/jobs/pending-reference.worker";
import { WagerSqsConsumer } from "../../src/infrastructure/messaging/sqs/wager-sqs.consumer";
import { MetricsService } from "../../src/infrastructure/observability/metrics.service";
import type { MessagePublisherPort, PublishOptions } from "../../src/application/ports/message-publisher.port";

import { Wallet } from "../../src/domain/entities/wallet";
import { Money } from "../../src/domain/value-objects/money";
import { WagerTransactionKind } from "../../src/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../src/domain/enums/wager-transaction-status";
import { FailureCode } from "../../src/domain/enums/failure-code";

describe("Distributed Wagering Concurrency & Resilience Suite (Seção 13.1 a 13.8)", () => {
  let orm: any;
  let em: EntityManager;
  let walletRepo: MikroOrmWalletRepository;
  let wagerTxRepo: MikroOrmWagerTransactionRepository;
  let outboxRepo: MikroOrmOutboxRepository;
  let uow: MikroOrmUnitOfWork;
  let useCase: ProcessWagerTransactionUseCase;
  let reconcileUseCase: ReconcileWalletUseCase;
  let metrics: MetricsService;

  const createIsolatedInstance = () => {
    const instanceEm = (orm.em.fork() as unknown) as EntityManager;
    const instanceWalletRepo = new MikroOrmWalletRepository(instanceEm);
    const instanceWagerRepo = new MikroOrmWagerTransactionRepository(instanceEm);
    const instanceOutboxRepo = new MikroOrmOutboxRepository(instanceEm);
    const instanceInboxRepo = new MikroOrmInboxRepository(instanceEm);
    const instanceUow = new MikroOrmUnitOfWork(instanceEm);
    const instanceUseCase = new ProcessWagerTransactionUseCase(
      instanceWalletRepo,
      instanceWagerRepo,
      instanceOutboxRepo,
      instanceUow,
      metrics,
    );
    return {
      em: instanceEm,
      walletRepo: instanceWalletRepo,
      wagerRepo: instanceWagerRepo,
      outboxRepo: instanceOutboxRepo,
      inboxRepo: instanceInboxRepo,
      uow: instanceUow,
      useCase: instanceUseCase,
    };
  };

  const openAndPersistWallet = async (amount: string, currency = "USD") => {
    const pId = `player-${crypto.randomUUID()}`;
    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: crypto.randomUUID(),
      playerId: pId,
      initialBalance: Money.from({ amount, currency }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingTransaction) await setupTxRepo.save(openingTransaction);
    if (openingLedgerEntry) await setupRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    return { walletId: wallet.id, playerId: pId };
  };

  beforeAll(async () => {
    orm = await setupTestDb();
    metrics = new MetricsService();

    em = (orm.em.fork() as unknown) as EntityManager;
    walletRepo = new MikroOrmWalletRepository(em);
    wagerTxRepo = new MikroOrmWagerTransactionRepository(em);
    outboxRepo = new MikroOrmOutboxRepository(em);
    uow = new MikroOrmUnitOfWork(em);
    useCase = new ProcessWagerTransactionUseCase(walletRepo, wagerTxRepo, outboxRepo, uow, metrics);
    reconcileUseCase = new ReconcileWalletUseCase(walletRepo, metrics);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it(
    "Cenário 13.1: Mesma aposta enviada 50 vezes em paralelo (mesma Idempotency-Key) resulta em 1 débito e 49 replays idempotentes sem erro 500",
    async () => {
      const { walletId, playerId } = await openAndPersistWallet("100.00", "USD");
      const sharedExtId = `ext-dup-50-${crypto.randomUUID()}`;
      const sharedIdemKey = `provider-dup:${sharedExtId}`;

      const input: ProcessWagerInputDto = {
        providerId: "provider-dup",
        externalTransactionId: sharedExtId,
        idempotencyKey: sharedIdemKey,
        playerId,
        walletId,
        roundId: "round-dup-1",
        gameId: "fortune-tiger",
        kind: WagerTransactionKind.Bet,
        money: { amount: "25.00", currency: "USD" },
      };

      const results = await Promise.all(
        Array.from({ length: 50 }, () => createIsolatedInstance().useCase.execute(input)),
      );

      const originals = results.filter((r) => !r.idempotentReplay);
      const replays = results.filter((r) => r.idempotentReplay);

      expect(originals).toHaveLength(1);
      expect(replays).toHaveLength(49);

      for (const r of results) {
        expect(r.status).toBe(WagerTransactionStatus.Processed);
        expect(r.transactionId).toBe(originals[0].transactionId);
        expect(r.balance?.amount).toBe("75.00");
      }

      const recon = await reconcileUseCase.execute(walletId);
      expect(recon.consistent).toBe(true);
      expect(recon.storedBalance.amount).toBe("75.00");
      expect(recon.checkedEntries).toBe(2); // OPENING + 1 BET
    },
    30000,
  );

  it(
    "Cenário 13.2: 50 apostas distintas de 80.00 em paralelo contra saldo de 100.00 -> 1 PROCESSED e 49 REJECTED (INSUFFICIENT_BALANCE)",
    async () => {
      const { walletId, playerId } = await openAndPersistWallet("100.00", "USD");
      const concurrencyCount = 50;

      const promises = Array.from({ length: concurrencyCount }, (_, i) => {
        const input: ProcessWagerInputDto = {
          providerId: "provider-conc",
          externalTransactionId: `ext-conc-${i}-${Date.now()}-${crypto.randomUUID()}`,
          playerId,
          walletId,
          roundId: `round-${i}`,
          gameId: `game-${i}`,
          kind: WagerTransactionKind.Bet,
          money: { amount: "80.00", currency: "USD" },
        };
        return createIsolatedInstance().useCase.execute(input);
      });

      const results = await Promise.all(promises);

      const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed);
      const rejected = results.filter((r) => r.status === WagerTransactionStatus.Rejected);

      expect(processed).toHaveLength(1);
      expect(rejected).toHaveLength(49);
      expect(processed[0].balance?.amount).toBe("20.00");

      for (const rej of rejected) {
        expect(rej.failureCode).toBe(FailureCode.InsufficientBalance);
        expect(rej.balance?.amount).toBe("20.00");
      }

      em.clear();
      const entries = await walletRepo.getLedgerEntries(walletId);
      expect(entries).toHaveLength(2);

      const reconciliation = await reconcileUseCase.execute(walletId);
      expect(reconciliation.consistent).toBe(true);
      expect(reconciliation.storedBalance.amount).toBe("20.00");
    },
    30000,
  );

  it(
    "Cenário 13.3: Operações concorrentes em múltiplas carteiras distintas sem contenção cruzada",
    async () => {
      const walletCount = 10;
      const wallets: { walletId: string; playerId: string }[] = [];

      for (let i = 0; i < walletCount; i++) {
        wallets.push(await openAndPersistWallet("100.00", "BRL"));
      }

      const results = await Promise.all(
        wallets.map((w, idx) =>
          createIsolatedInstance().useCase.execute({
            providerId: "provider-multi",
            externalTransactionId: `ext-multi-${idx}-${crypto.randomUUID()}`,
            playerId: w.playerId,
            walletId: w.walletId,
            roundId: `round-${idx}`,
            gameId: "fortune-chimp",
            kind: WagerTransactionKind.Bet,
            money: { amount: "35.00", currency: "BRL" },
          }),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe(WagerTransactionStatus.Processed);
        expect(res.balance?.amount).toBe("65.00");
      }

      em.clear();
      for (const w of wallets) {
        const recon = await reconcileUseCase.execute(w.walletId);
        expect(recon.consistent).toBe(true);
        expect(recon.storedBalance.amount).toBe("65.00");
      }
    },
    30000,
  );

  it(
    "Cenário 13.4: 3 instâncias independentes da aplicação operando concorrentemente sobre a mesma carteira",
    async () => {
      const { walletId, playerId } = await openAndPersistWallet("500.00", "BRL");
      const instances = [createIsolatedInstance(), createIsolatedInstance(), createIsolatedInstance()];

      // 30 operações de BET de 10.00 distribuídas entre as 3 instâncias simultaneamente
      const betPromises = Array.from({ length: 30 }, (_, idx) => {
        const inst = instances[idx % 3];
        return inst.useCase.execute({
          providerId: "provider-3inst",
          externalTransactionId: `bet-3inst-${idx}-${crypto.randomUUID()}`,
          playerId,
          walletId,
          roundId: `round-3inst-${idx}`,
          gameId: "aviator",
          kind: WagerTransactionKind.Bet,
          money: { amount: "10.00", currency: "BRL" },
        });
      });

      const results = await Promise.all(betPromises);
      expect(results.every((r) => r.status === WagerTransactionStatus.Processed)).toBe(true);

      const recon = await reconcileUseCase.execute(walletId);
      expect(recon.consistent).toBe(true);
      expect(recon.storedBalance.amount).toBe("200.00");
      expect(recon.checkedEntries).toBe(31); // 1 OPENING + 30 BETs
    },
    30000,
  );

  it(
    "Cenário 13.5: Queda de worker após commit do DB e antes do ACK no SQS -> redelivery deduplicado via Inbox",
    async () => {
      const { walletId, playerId } = await openAndPersistWallet("100.00", "BRL");
      const sqsMessageId = `msg-crash-${crypto.randomUUID()}`;
      const extId = `ext-crash-${crypto.randomUUID()}`;

      let shouldFailAckOnFirstCall = true;
      const ackedHandles: string[] = [];

      const mockSqs = {
        send: mock(async (cmd: any) => {
          if (cmd.constructor?.name === "DeleteMessageCommand") {
            if (shouldFailAckOnFirstCall) {
              shouldFailAckOnFirstCall = false;
              throw new Error("Simulated worker crash / network drop before SQS ACK");
            }
            ackedHandles.push(cmd.input.ReceiptHandle);
          }
          return {};
        }),
        destroy: mock(() => {}),
      } as any;

      const inst1 = createIsolatedInstance();
      const consumer1 = new WagerSqsConsumer(
        inst1.useCase,
        inst1.inboxRepo,
        inst1.uow,
        metrics,
        mockSqs,
      );

      const sqsPayload = {
        MessageId: sqsMessageId,
        ReceiptHandle: "rh-attempt-1",
        Attributes: { ApproximateReceiveCount: "1" },
        Body: JSON.stringify({
          type: "WagerTransactionRequested",
          data: {
            providerId: "pragmatic",
            externalTransactionId: extId,
            playerId,
            walletId,
            roundId: "round-crash-1",
            gameId: "gates-of-olympus",
            kind: "BET",
            money: { amount: "40.00", currency: "BRL" },
          },
        }),
      };

      // 1ª execução: comita no banco mas falha ao enviar o ACK para o SQS
      await consumer1.processMessage(sqsPayload);

      // 2ª execução (em outra instância após o visibility timeout): SQS reentrega a mesma mensagem
      const inst2 = createIsolatedInstance();
      const consumer2 = new WagerSqsConsumer(
        inst2.useCase,
        inst2.inboxRepo,
        inst2.uow,
        metrics,
        mockSqs,
      );
      await consumer2.processMessage({
        ...sqsPayload,
        ReceiptHandle: "rh-attempt-2",
        Attributes: { ApproximateReceiveCount: "2" },
      });

      expect(ackedHandles).toContain("rh-attempt-2");

      const recon = await reconcileUseCase.execute(walletId);
      expect(recon.consistent).toBe(true);
      expect(recon.storedBalance.amount).toBe("60.00");
      expect(recon.checkedEntries).toBe(2); // Debitado uma única vez!
    },
    30000,
  );

  it(
    "Cenário 13.6: 2 OutboxPublishers concorrentes publicam mensagens usando FOR UPDATE SKIP LOCKED sem duplicação",
    async () => {
      const publishedIds: string[] = [];

      const fakeBroker: MessagePublisherPort = {
        async publish(_queueUrl: string, payload: Record<string, unknown>, _options?: PublishOptions): Promise<void> {
          await new Promise((r) => setTimeout(r, 10));
          publishedIds.push(String(payload.eventId));
        },
      };

      const inst1 = createIsolatedInstance();
      const inst2 = createIsolatedInstance();

      const publisher1 = new OutboxPublisher(
        inst1.outboxRepo,
        fakeBroker,
        inst1.uow,
        "http://localhost:4566/000000000000/wager-transactions.fifo",
        metrics,
      );
      const publisher2 = new OutboxPublisher(
        inst2.outboxRepo,
        fakeBroker,
        inst2.uow,
        "http://localhost:4566/000000000000/wager-transactions.fifo",
        metrics,
      );

      await Promise.all([
        publisher1.processPendingMessages(50),
        publisher2.processPendingMessages(50),
      ]);

      const uniqueIds = new Set(publishedIds);
      expect(uniqueIds.size).toBe(publishedIds.length);
      expect(publishedIds.length).toBeGreaterThan(0);
    },
    30000,
  );

  it(
    "Cenário 13.7 e 13.8: REFUND chega antes da BET (PENDING_REFERENCE), BET chega depois e workers concorrentes reconciliam com consistência total",
    async () => {
      const { walletId, playerId } = await openAndPersistWallet("100.00", "BRL");
      const betExtId = `bet-late-${crypto.randomUUID()}`;
      const refundExtId = `refund-early-${crypto.randomUUID()}`;

      // 1. REFUND chega antes da BET -> deve ficar PENDING_REFERENCE sem alterar o saldo
      const refundInitial = await createIsolatedInstance().useCase.execute({
        providerId: "evolution",
        externalTransactionId: refundExtId,
        playerId,
        walletId,
        roundId: "round-out-of-order",
        gameId: "roulette",
        kind: WagerTransactionKind.Refund,
        referenceExternalTransactionId: betExtId,
        money: { amount: "30.00", currency: "BRL" },
      });

      expect(refundInitial.status).toBe(WagerTransactionStatus.PendingReference);

      // 2. BET chega depois -> debita 30.00 (saldo vai a 70.00) e reconcilia ou permite ao worker reconciliar o REFUND
      const betRes = await createIsolatedInstance().useCase.execute({
        providerId: "evolution",
        externalTransactionId: betExtId,
        playerId,
        walletId,
        roundId: "round-out-of-order",
        gameId: "roulette",
        kind: WagerTransactionKind.Bet,
        money: { amount: "30.00", currency: "BRL" },
      });
      expect(betRes.status).toBe(WagerTransactionStatus.Processed);

      // 3. Dois PendingReferenceWorkers concorrentes rodam ao mesmo tempo (FOR UPDATE SKIP LOCKED)
      const wInst1 = createIsolatedInstance();
      const wInst2 = createIsolatedInstance();
      const worker1 = new PendingReferenceWorker(wInst1.wagerRepo, wInst1.useCase, wInst1.uow, metrics);
      const worker2 = new PendingReferenceWorker(wInst2.wagerRepo, wInst2.useCase, wInst2.uow, metrics);

      await Promise.all([worker1.handle(), worker2.handle()]);

      // 4. Verifica que o REFUND foi processado exatamente uma vez, restaurando o saldo para 100.00
      const checkInst = createIsolatedInstance();
      const resolvedRefund = await checkInst.wagerRepo.findByProviderAndExternalId("evolution", refundExtId);
      expect(resolvedRefund?.status).toBe(WagerTransactionStatus.Processed);

      const finalRecon = await reconcileUseCase.execute(walletId);
      expect(finalRecon.consistent).toBe(true);
      expect(finalRecon.storedBalance.amount).toBe("100.00");
      expect(finalRecon.calculatedBalance.amount).toBe("100.00");
      expect(finalRecon.checkedEntries).toBe(3); // OPENING (+100), BET (-30), REFUND (+30)
    },
    30000,
  );
});
