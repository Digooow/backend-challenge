import { describe, expect, it, beforeEach } from "bun:test";
import { ProcessWagerTransactionUseCase } from "../../../src/application/use-cases/process-wager-transaction.use-case";
import { Wallet } from "../../../src/domain/entities/wallet";
import { WagerTransaction } from "../../../src/domain/entities/wager-transaction";
import { WalletLedgerEntry } from "../../../src/domain/entities/wallet-ledger-entry";
import { OutboxMessage } from "../../../src/domain/entities/outbox-message";
import { Money } from "../../../src/domain/value-objects/money";
import { WagerTransactionKind } from "../../../src/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../../src/domain/enums/wager-transaction-status";
import { FailureCode } from "../../../src/domain/enums/failure-code";
import { WalletRepositoryPort } from "../../../src/application/ports/wallet.repository";
import { WagerTransactionRepositoryPort } from "../../../src/application/ports/wager-transaction.repository";
import { OutboxRepositoryPort } from "../../../src/application/ports/outbox.repository";
import { UnitOfWorkPort } from "../../../src/application/ports/unit-of-work.port";

class InMemoryWalletRepo implements WalletRepositoryPort {
  wallets = new Map<string, Wallet>();
  entries: WalletLedgerEntry[] = [];

  async findById(id: string): Promise<Wallet | null> {
    return this.wallets.get(id) ?? null;
  }
  async findByPlayerAndCurrency(): Promise<Wallet | null> {
    return null;
  }
  async save(wallet: Wallet): Promise<void> {
    this.wallets.set(wallet.id, wallet);
  }
  async saveLedgerEntry(entry: WalletLedgerEntry): Promise<void> {
    this.entries.push(entry);
  }
  async getLedgerEntries(): Promise<WalletLedgerEntry[]> {
    return this.entries;
  }
}

class InMemoryWagerTxRepo implements WagerTransactionRepositoryPort {
  transactions = new Map<string, WagerTransaction>();

  async findById(id: string): Promise<WagerTransaction | null> {
    return this.transactions.get(id) ?? null;
  }
  async findByIdempotencyKey(key: string): Promise<WagerTransaction | null> {
    for (const tx of this.transactions.values()) {
      if (tx.idempotencyKey === key) return tx;
    }
    return null;
  }
  async findByProviderAndExternalId(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null> {
    for (const tx of this.transactions.values()) {
      if (tx.providerId === providerId && tx.externalTransactionId === externalTransactionId) return tx;
    }
    return null;
  }
  async save(transaction: WagerTransaction): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }
}

class InMemoryOutboxRepo implements OutboxRepositoryPort {
  messages: OutboxMessage[] = [];
  async save(message: OutboxMessage): Promise<void> {
    this.messages.push(message);
  }
  async findPending(): Promise<OutboxMessage[]> {
    return this.messages;
  }
}

class DirectUnitOfWork implements UnitOfWorkPort {
  async transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return work({});
  }
}

describe("ProcessWagerTransactionUseCase (Unit)", () => {
  let walletRepo: InMemoryWalletRepo;
  let wagerTxRepo: InMemoryWagerTxRepo;
  let outboxRepo: InMemoryOutboxRepo;
  let useCase: ProcessWagerTransactionUseCase;

  beforeEach(() => {
    walletRepo = new InMemoryWalletRepo();
    wagerTxRepo = new InMemoryWagerTxRepo();
    outboxRepo = new InMemoryOutboxRepo();
    useCase = new ProcessWagerTransactionUseCase(walletRepo, wagerTxRepo, outboxRepo, new DirectUnitOfWork());

    const { wallet } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });
    walletRepo.save(wallet);
  });

  it("deve processar uma aposta BET com sucesso e gravar no Outbox", async () => {
    const result = await useCase.execute({
      providerId: "provider-a",
      externalTransactionId: "ext-1",
      walletId: "wallet-1",
      playerId: "player-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "25.00", currency: "BRL" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance?.amount).toBe("75.00");
    expect(result.idempotentReplay).toBe(false);
    expect(outboxRepo.messages.length).toBe(1);
  });

  it("deve retornar replay idempotente para a mesma requisição", async () => {
    const input = {
      providerId: "provider-a",
      externalTransactionId: "ext-1",
      walletId: "wallet-1",
      playerId: "player-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "25.00", currency: "BRL" },
    };

    await useCase.execute(input);
    const replay = await useCase.execute(input);

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.balance?.amount).toBe("75.00");
  });

  it("deve rejeitar aposta se o saldo for insuficiente", async () => {
    const result = await useCase.execute({
      providerId: "provider-a",
      externalTransactionId: "ext-2",
      walletId: "wallet-1",
      playerId: "player-1",
      roundId: "round-1",
      gameId: "game-1",
      kind: WagerTransactionKind.Bet,
      money: { amount: "150.00", currency: "BRL" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.InsufficientBalance);
    expect(result.balance?.amount).toBe("100.00");
  });
});