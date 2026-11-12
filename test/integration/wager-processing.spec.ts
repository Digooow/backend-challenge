import { describe, it, beforeAll, afterAll, expect } from "bun:test";
import { MikroORM, EntityManager } from "@mikro-orm/postgresql";

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

    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "100.00", currency }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingTransaction) {
      await setupTxRepo.save(openingTransaction);
    }
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

  it("deve retornar replay idempotente para a mesma transação com o saldo histórico original (Regra 7)", async () => {
    const playerId = `player-idem-${crypto.randomUUID()}`;
    const currency = "USD";
    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "200.00", currency }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingTransaction) {
      await setupTxRepo.save(openingTransaction);
    }
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
    expect(first.balance?.amount).toBe("175.00");

    // Outra aposta altera o saldo atual da carteira para 150.00
    await useCase.execute({
      ...input,
      externalTransactionId: `ext-idem-other-${crypto.randomUUID()}`,
    });

    // O replay da primeira aposta deve retornar o saldo histórico 175.00
    const second = await useCase.execute(input);

    expect(second.idempotentReplay).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(second.balance?.amount).toBe("175.00");
  });

  it("deve rejeitar BET se o saldo for insuficiente", async () => {
    const playerId = `player-broke-${crypto.randomUUID()}`;
    const currency = "USD";

    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.zero(currency),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingTransaction) {
      await setupTxRepo.save(openingTransaction);
    }
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

  it("deve bloquear UPDATE e DELETE em wallet_ledger_entries via trigger Append-Only no PostgreSQL (Seção 5 Regra 5 e 9)", async () => {
    const playerId = `player-immutable-${crypto.randomUUID()}`;
    const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
      id: crypto.randomUUID(),
      playerId,
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    const setupEm = (orm.em.fork() as unknown) as EntityManager;
    const setupRepo = new MikroOrmWalletRepository(setupEm);
    const setupTxRepo = new MikroOrmWagerTransactionRepository(setupEm);
    await setupRepo.save(wallet);
    if (openingTransaction) await setupTxRepo.save(openingTransaction);
    if (openingLedgerEntry) await setupRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    const connection = orm.em.getConnection();

    await expect(
      connection.execute(
        `UPDATE "wallet_ledger_entries" SET amount = 999.00 WHERE id = '${openingLedgerEntry!.id}'`,
      ),
    ).rejects.toThrow(/append-only/);

    await expect(
      connection.execute(
        `DELETE FROM "wallet_ledger_entries" WHERE id = '${openingLedgerEntry!.id}'`,
      ),
    ).rejects.toThrow(/append-only/);
  });
});
