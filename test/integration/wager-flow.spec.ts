import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { setupTestDb, teardownTestDb } from "../setup/setup-test-db";
import { ProcessWagerTransactionUseCase } from "../../src/application/use-cases/process-wager-transaction.use-case";
import { ReconcileWalletUseCase } from "../../src/application/use-cases/reconcile-wallet.use-case";
import { MikroOrmWalletRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wallet.repository";
import { MikroOrmWagerTransactionRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository";
import { MikroOrmOutboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-outbox.repository";
import { MikroOrmInboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-inbox.repository";
import { MikroOrmUnitOfWork } from "../../src/infrastructure/database/unit-of-work";
import { WagerSqsConsumer } from "../../src/infrastructure/messaging/sqs/wager-sqs.consumer";
import { Wallet } from "../../src/domain/entities/wallet";
import { Money } from "../../src/domain/value-objects/money";
import { WagerTransactionStatus } from "../../src/domain/enums/wager-transaction-status";
import { WagerTransactionKind } from "../../src/domain/enums/wager-transaction-kind";
import { MetricsService } from "../../src/infrastructure/observability/metrics.service";

describe("Wager Processing End-to-End Flow & Inbox/Outbox Integration", () => {
  let orm: any;
  let useCase: ProcessWagerTransactionUseCase;
  let reconcileUseCase: ReconcileWalletUseCase;
  let walletRepo: MikroOrmWalletRepository;
  let metrics: MetricsService;

  beforeAll(async () => {
    orm = await setupTestDb();
    const em = orm.em.fork();
    walletRepo = new MikroOrmWalletRepository(em);
    const wagerRepo = new MikroOrmWagerTransactionRepository(em);
    const outboxRepo = new MikroOrmOutboxRepository(em);
    const uow = new MikroOrmUnitOfWork(em);
    metrics = new MetricsService();

    useCase = new ProcessWagerTransactionUseCase(walletRepo, wagerRepo, outboxRepo, uow, metrics);
    reconcileUseCase = new ReconcileWalletUseCase(walletRepo, metrics);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("deve processar BET, atualizar o saldo, gerar eventos no Outbox na mesma transação e paginar o ledger com cursor opaco", async () => {
    const walletId = crypto.randomUUID();
    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: walletId,
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "EUR" }),
    });
    const setupEm = orm.em.fork();
    const setupWalletRepo = new MikroOrmWalletRepository(setupEm);
    const setupWagerRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupWalletRepo.save(wallet);
    if (openingTransaction) await setupWagerRepo.save(openingTransaction);
    if (openingLedgerEntry) await setupWalletRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    const result = await useCase.execute({
      providerId: "provider-x",
      externalTransactionId: "ext-123",
      idempotencyKey: "idem-123",
      playerId: "player-1",
      walletId: walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "10.00", currency: "EUR" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);

    const checkEm = orm.em.fork();
    const checkWalletRepo = new MikroOrmWalletRepository(checkEm);
    const updatedWallet = await checkWalletRepo.findById(walletId);
    expect(updatedWallet?.balance.toJSON().amount).toBe("90.00");

    // Verificar se os eventos foram para o Outbox
    const pendingEvents = await new MikroOrmOutboxRepository(orm.em.fork()).findPending(10);
    expect(pendingEvents.length).toBeGreaterThanOrEqual(2);
    const eventTypes = pendingEvents.map((e) => e.eventType);
    expect(eventTypes).toContain("WalletBalanceChanged");
    expect(eventTypes).toContain("WagerTransactionProcessed");

    // Verificar paginação keyset com cursor opaco
    const page1 = await checkWalletRepo.getLedgerEntriesPaginated(walletId, 1);
    expect(page1.toHaveLength(2)).toBe(true); // 1 + 1 para detecção de nextCursor
    const nextCursor = MikroOrmWalletRepository.encodeLedgerCursor({
      createdAt: page1[0].createdAt,
      id: page1[0].id,
    });
    const page2 = await checkWalletRepo.getLedgerEntriesPaginated(walletId, 1, nextCursor);
    expect(page2).toHaveLength(1);
    expect(page2[0].id).not.toBe(page1[0].id);

    // Reconciliação nativa SQL O(1)
    const recon = await reconcileUseCase.execute(walletId);
    expect(recon.consistent).toBe(true);
    expect(recon.storedBalance.amount).toBe("90.00");
    expect(recon.calculatedBalance.amount).toBe("90.00");
  });

  it("deve deduplicar mensagens redelivered via tabela inbox_messages no PostgreSQL através do WagerSqsConsumer (Seção 10.2 e 13.5)", async () => {
    const walletId = crypto.randomUUID();
    const playerId = `player-sqs-${crypto.randomUUID()}`;
    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    const setupEm = orm.em.fork();
    const setupWalletRepo = new MikroOrmWalletRepository(setupEm);
    const setupWagerRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupWalletRepo.save(wallet);
    if (openingTransaction) await setupWagerRepo.save(openingTransaction);
    if (openingLedgerEntry) await setupWalletRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    const deletedHandles: string[] = [];
    const mockSqs = {
      send: mock(async (cmd: any) => {
        if (cmd.constructor?.name === "DeleteMessageCommand") {
          deletedHandles.push(cmd.input.ReceiptHandle);
        }
        return {};
      }),
      destroy: mock(() => {}),
    } as any;

    const consumerEm = orm.em.fork();
    const consumer = new WagerSqsConsumer(
      new ProcessWagerTransactionUseCase(
        new MikroOrmWalletRepository(consumerEm),
        new MikroOrmWagerTransactionRepository(consumerEm),
        new MikroOrmOutboxRepository(consumerEm),
        new MikroOrmUnitOfWork(consumerEm),
        metrics,
      ),
      new MikroOrmInboxRepository(consumerEm),
      new MikroOrmUnitOfWork(consumerEm),
      metrics,
      mockSqs,
    );

    const sqsMsg = {
      MessageId: `msg-${crypto.randomUUID()}`,
      ReceiptHandle: "rh-first",
      Body: JSON.stringify({
        type: "WagerTransactionRequested",
        data: {
          providerId: "evolution",
          externalTransactionId: `ext-sqs-${crypto.randomUUID()}`,
          playerId,
          walletId,
          roundId: "round-sqs-1",
          gameId: "crazy-time",
          kind: "BET",
          money: { amount: "30.00", currency: "BRL" },
        },
      }),
    };

    // Primeira entrega: debita 30.00 e grava na inbox_messages
    await consumer.processMessage(sqsMsg);
    // Redelivery da mesma mensagem SQS (simulando crash antes do ACK)
    await consumer.processMessage({ ...sqsMsg, ReceiptHandle: "rh-second" });

    expect(deletedHandles).toEqual(["rh-first", "rh-second"]);

    const checkEm = orm.em.fork();
    const updatedWallet = await new MikroOrmWalletRepository(checkEm).findById(walletId);
    expect(updatedWallet?.balance.toJSON().amount).toBe("70.00");
  });
});
