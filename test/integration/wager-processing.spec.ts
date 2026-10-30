import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { MikroORM } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";

// Importando o setup correto
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

describe("Wager processing (integration)", () => {
  let orm: MikroORM;
  let em: EntityManager;
  let walletRepo: MikroOrmWalletRepository;
  let wagerTxRepo: MikroOrmWagerTransactionRepository;
  let outboxRepo: MikroOrmOutboxRepository;
  let uow: MikroOrmUnitOfWork;
  let useCase: ProcessWagerTransactionUseCase;

  beforeAll(async () => {
    // Usando a função que apaga e recria o banco de dados corretamente
    orm = await setupTestDb();
    
    em = (orm.em.fork() as unknown) as EntityManager;

    walletRepo = new MikroOrmWalletRepository(em);
    wagerTxRepo = new MikroOrmWagerTransactionRepository(em);
    outboxRepo = new MikroOrmOutboxRepository(em);
    uow = new MikroOrmUnitOfWork(em);

    useCase = new ProcessWagerTransactionUseCase(
      walletRepo,
      wagerTxRepo,
      outboxRepo,
      uow,
    );
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("deve processar uma aposta BET e debitar a wallet", async () => {
    const playerId = `player-${crypto.randomUUID()}`;
    const currency = "USD";

    const { wallet, openingLedgerEntry } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "100.00", currency }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingLedgerEntry) {
      await setupRepo.saveLedgerEntry(openingLedgerEntry);
    }
    await setupEm.flush();

    const input: ProcessWagerInputDto = {
      providerId: "provider-xyz",
      externalTransactionId: `ext-${Date.now()}-${crypto.randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "10.00", currency },
    };

    const result = await useCase.execute(input);

    expect(result.transactionId).toBeDefined();
    expect(result.status).toBe(WagerTransactionStatus.Processed as any);
    expect(result.idempotentReplay).toBe(false);
    expect(result.balance?.amount).toBe("90.00");
  });

  it("deve retornar replay idempotente para a mesma transação", async () => {
    const playerId = `player-idem-${crypto.randomUUID()}`;
    const currency = "USD";
    const { wallet, openingLedgerEntry } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "200.00", currency }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingLedgerEntry) {
      await setupRepo.saveLedgerEntry(openingLedgerEntry);
    }
    await setupEm.flush();

    const input: ProcessWagerInputDto = {
      providerId: "provider-idem",
      externalTransactionId: `ext-idem-${Date.now()}-${crypto.randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: "round-2",
      gameId: "game-2",
      kind: WagerTransactionKind.Bet,
      money: { amount: "25.00", currency },
    };

    const first = await useCase.execute(input);
    expect(first.idempotentReplay).toBe(false);

    const second = await useCase.execute(input);

    expect(second.idempotentReplay).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
  });

  it("deve rejeitar BET se o saldo for insuficiente", async () => {
    const playerId = `player-broke-${crypto.randomUUID()}`;
    const currency = "USD";

    const { wallet, openingLedgerEntry } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.zero(currency),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingLedgerEntry) {
      await setupRepo.saveLedgerEntry(openingLedgerEntry);
    }
    await setupEm.flush();

    const input: ProcessWagerInputDto = {
      providerId: "provider-broke",
      externalTransactionId: `ext-broke-${Date.now()}-${crypto.randomUUID()}`,
      playerId,
      walletId: wallet.id,
      roundId: "round-3",
      gameId: "game-3",
      kind: WagerTransactionKind.Bet,
      money: { amount: "50.00", currency },
    };

    const result = await useCase.execute(input);

    expect(result.status).toBe(WagerTransactionStatus.Rejected as any);
    expect(result.failureCode).toBe(FailureCode.InsufficientBalance as any);
  });
});