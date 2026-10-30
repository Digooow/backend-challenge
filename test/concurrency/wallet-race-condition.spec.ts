import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { EntityManager } from "@mikro-orm/postgresql";

import { setupTestDb, teardownTestDb } from "../setup/setup-test-db";
import { ProcessWagerTransactionUseCase } from "../../src/application/use-cases/process-wager-transaction.use-case";
import type { ProcessWagerInputDto } from "../../src/application/dtos/process-wager.dto";

import { MikroOrmWalletRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wallet.repository";
import { MikroOrmWagerTransactionRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository";
import { MikroOrmOutboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-outbox.repository";
import { MikroOrmUnitOfWork } from "../../src/infrastructure/database/unit-of-work";

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

    playerId = `player-${crypto.randomUUID()}`;

    const { wallet, openingLedgerEntry } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "100.00", currency: "USD" }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingLedgerEntry) await setupRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    walletId = wallet.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it(
    "processes 50 concurrent BETs of 80.00 correctly against a 100.00 balance",
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

      const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed as any);
      const rejected = results.filter((r) => r.status === WagerTransactionStatus.Rejected as any);

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
    },
    30000,
  );
});