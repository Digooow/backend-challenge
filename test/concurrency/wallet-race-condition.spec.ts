import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { EntityManager } from "@mikro-orm/postgresql";

import { setupTestDb, teardownTestDb } from "../setup/setup-test-db";
import { ProcessWagerTransactionUseCase } from "../../src/application/use-cases/process-wager-transaction.use-case";
import { ReconcileWalletUseCase } from "../../src/application/use-cases/reconcile-wallet.use-case";
import type { ProcessWagerInputDto } from "../../src/application/dtos/process-wager.dto";

import { MikroOrmWalletRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wallet.repository";
import { MikroOrmWagerTransactionRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository";
import { MikroOrmOutboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-outbox.repository";
import { MikroOrmUnitOfWork } from "../../src/infrastructure/database/unit-of-work";
import { OutboxPublisher } from "../../src/infrastructure/messaging/outbox/outbox.publisher";
import type { MessagePublisherPort, PublishOptions } from "../../src/application/ports/message-publisher.port";

import { Wallet } from "../../src/domain/entities/wallet";
import { Money } from "../../src/domain/value-objects/money";
import { WagerTransactionKind } from "../../src/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../src/domain/enums/wager-transaction-status";
import { FailureCode } from "../../src/domain/enums/failure-code";

describe("Wallet race condition (concurrency)", () => {
  let orm: any;
  let em: EntityManager;
  let walletRepo: MikroOrmWalletRepository;
  let wagerTxRepo: MikroOrmWagerTransactionRepository;
  let outboxRepo: MikroOrmOutboxRepository;
  let uow: MikroOrmUnitOfWork;
  let useCase: ProcessWagerTransactionUseCase;
  let reconcileUseCase: ReconcileWalletUseCase;
  let walletId: string;
  let playerId: string;

  beforeAll(async () => {
    orm = await setupTestDb();

    em = (orm.em.fork() as unknown) as EntityManager;
    walletRepo = new MikroOrmWalletRepository(em);
    wagerTxRepo = new MikroOrmWagerTransactionRepository(em);
    outboxRepo = new MikroOrmOutboxRepository(em);
    uow = new MikroOrmUnitOfWork(em);
    useCase = new ProcessWagerTransactionUseCase(walletRepo, wagerTxRepo, outboxRepo, uow);
    reconcileUseCase = new ReconcileWalletUseCase(walletRepo);

    playerId = `player-${crypto.randomUUID()}`;

    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "100.00", currency: "USD" }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingTransaction) await setupTxRepo.save(openingTransaction);
    if (openingLedgerEntry) await setupRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    walletId = wallet.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it(
    "processes 50 concurrent BETs of 80.00 correctly against a 100.00 balance (Seção 8 e 13.2)",
    async () => {
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
        return useCase.execute(input);
      });

      const results = await Promise.all(promises);

      const processed = results.filter((r) => r.status === (WagerTransactionStatus.Processed as any));
      const rejected = results.filter((r) => r.status === (WagerTransactionStatus.Rejected as any));

      expect(processed).toHaveLength(1);
      expect(rejected).toHaveLength(49);
      expect(processed[0].balance?.amount).toBe("20.00");

      for (const rej of rejected) {
        expect(rej.failureCode).toBe(FailureCode.InsufficientBalance as any);
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
    "processes multiple distinct wallets in parallel without cross-wallet contention (Seção 13.3)",
    async () => {
      const walletCount = 10;
      const wallets: { walletId: string; playerId: string }[] = [];

      const setupEm = (orm.em.fork() as unknown) as EntityManager;
      const setupRepo = new MikroOrmWalletRepository(setupEm);
      const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);

      for (let i = 0; i < walletCount; i++) {
        const pId = `player-parallel-${i}-${crypto.randomUUID()}`;
        const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
          id: crypto.randomUUID(),
          playerId: pId,
          initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
        });
        await setupRepo.save(wallet);
        if (openingTransaction) await setupTxRepo.save(openingTransaction);
        if (openingLedgerEntry) await setupRepo.saveLedgerEntry(openingLedgerEntry);
        wallets.push({ walletId: wallet.id, playerId: pId });
      }
      await setupEm.flush();

      const results = await Promise.all(
        wallets.map((w, idx) =>
          useCase.execute({
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
    "allows two concurrent OutboxPublishers to relay messages using FOR UPDATE SKIP LOCKED without duplicate publishing (Seção 13.6)",
    async () => {
      const publishedIds: string[] = [];

      const fakeBroker: MessagePublisherPort = {
        async publish(_queueUrl: string, payload: Record<string, unknown>, _options?: PublishOptions): Promise<void> {
          await new Promise((r) => setTimeout(r, 10));
          publishedIds.push(String(payload.eventId));
        },
      };

      const em1 = (orm.em.fork() as unknown) as EntityManager;
      const em2 = (orm.em.fork() as unknown) as EntityManager;

      const publisher1 = new OutboxPublisher(
        new MikroOrmOutboxRepository(em1),
        fakeBroker,
        new MikroOrmUnitOfWork(em1),
        "http://localhost:4566/000000000000/wager-transactions.fifo",
      );
      const publisher2 = new OutboxPublisher(
        new MikroOrmOutboxRepository(em2),
        fakeBroker,
        new MikroOrmUnitOfWork(em2),
        "http://localhost:4566/000000000000/wager-transactions.fifo",
      );

      // Dispara os 2 publishers simultaneamente sobre a mesma tabela outbox_messages
      await Promise.all([
        publisher1.processPendingMessages(50),
        publisher2.processPendingMessages(50),
      ]);

      // Nenhum eventId deve ter sido publicado em duplicidade pelos dois workers concorrentes
      const uniqueIds = new Set(publishedIds);
      expect(uniqueIds.size).toBe(publishedIds.length);
      expect(publishedIds.length).toBeGreaterThan(0);
    },
    30000,
  );
});
