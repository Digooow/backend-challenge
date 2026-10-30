import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../setup/setup-test-db";
import { ProcessWagerTransactionUseCase } from "../../src/application/use-cases/process-wager-transaction.use-case";
import { MikroOrmWalletRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wallet.repository";
import { MikroOrmWagerTransactionRepository } from "../../src/infrastructure/database/repositories/mikro-orm-wager-transaction.repository";
import { MikroOrmOutboxRepository } from "../../src/infrastructure/database/repositories/mikro-orm-outbox.repository";
import { MikroOrmUnitOfWork } from "../../src/infrastructure/database/unit-of-work";
import { Wallet } from "../../src/domain/entities/wallet";
import { Money } from "../../src/domain/value-objects/money";
import { WagerTransactionStatus } from "../../src/domain/enums/wager-transaction-status";
import { WagerTransactionKind } from "../../src/domain/enums/wager-transaction-kind";

describe("Wager Processing Flow", () => {
  let orm: any;
  let useCase: ProcessWagerTransactionUseCase;
  let walletRepo: MikroOrmWalletRepository;

  beforeAll(async () => {
    orm = await setupTestDb();
    const em = orm.em.fork();
    walletRepo = new MikroOrmWalletRepository(em);
    const wagerRepo = new MikroOrmWagerTransactionRepository(em);
    const outboxRepo = new MikroOrmOutboxRepository(em);
    const uow = new MikroOrmUnitOfWork(em);
    
    useCase = new ProcessWagerTransactionUseCase(walletRepo, wagerRepo, outboxRepo, uow);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("deve processar uma aposta, atualizar o saldo e gerar um evento no outbox na mesma transação", async () => {
    // 1. Setup: Criar carteira inicial
    const walletId = crypto.randomUUID();
    const { wallet, openingLedgerEntry } = Wallet.open({
      id: walletId,
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "EUR" })
    });
    const setupEm = orm.em.fork();
    const setupWalletRepo = new MikroOrmWalletRepository(setupEm);
    await setupWalletRepo.save(wallet);
    if(openingLedgerEntry) await setupWalletRepo.saveLedgerEntry(openingLedgerEntry);
    await setupEm.flush();

    // 2. Execução: Processar aposta
    const result = await useCase.execute({
      providerId: "provider-x",
      externalTransactionId: "ext-123",
      idempotencyKey: "idem-123",
      playerId: "player-1",
      walletId: walletId,
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "10.00", currency: "EUR" }
    });

    // 3. Asserção
    expect(result.status).toBe(WagerTransactionStatus.Processed as any);

    const updatedWallet = await walletRepo.findById(walletId);
    expect(updatedWallet?.balance.toJSON().amount).toBe("90.00");

    // Verificar se o evento foi para o Outbox
    const pendingEvents = await (new MikroOrmOutboxRepository(orm.em.fork())).findPending(10);
    expect(pendingEvents.length).toBeGreaterThan(0);
    expect(pendingEvents[0].eventType).toBe("WalletBalanceChanged");
  });
});