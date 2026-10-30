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

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    return this.findById(id);
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

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    for (const tx of this.transactions.values()) {
      if (
        tx.providerId === providerId &&
        tx.externalTransactionId === externalTransactionId
      ) {
        return tx;
      }
    }
    return null;
  }

  async save(transaction: WagerTransaction): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }

  async findPendingReferences(limit: number): Promise<WagerTransaction[]> {
    const pending: WagerTransaction[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.status === WagerTransactionStatus.PendingReference) {
        pending.push(tx);
        if (pending.length >= limit) break;
      }
    }
    return pending;
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

  const defaultProps = {
    providerId: "provider-a",
    walletId: "wallet-1",
    playerId: "player-1",
    roundId: "round-1",
    gameId: "game-1",
    money: { amount: "50.00", currency: "BRL" },
  };

  beforeEach(() => {
    walletRepo = new InMemoryWalletRepo();
    wagerTxRepo = new InMemoryWagerTxRepo();
    outboxRepo = new InMemoryOutboxRepo();
    useCase = new ProcessWagerTransactionUseCase(
      walletRepo,
      wagerTxRepo,
      outboxRepo,
      new DirectUnitOfWork(),
    );

    const { wallet } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });
    walletRepo.save(wallet);
  });

  it("deve processar uma aposta BET com sucesso e gravar no Outbox", async () => {
    const result = await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-1",
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
      ...defaultProps,
      externalTransactionId: "ext-1",
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
      ...defaultProps,
      externalTransactionId: "ext-2",
      kind: WagerTransactionKind.Bet,
      money: { amount: "150.00", currency: "BRL" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Rejected);
    expect(result.failureCode).toBe(FailureCode.InsufficientBalance);
    expect(result.balance?.amount).toBe("100.00");
  });

  it("deve processar WIN e creditar o saldo na carteira", async () => {
    const result = await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-win-1",
      kind: WagerTransactionKind.Win,
      money: { amount: "150.00", currency: "BRL" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance?.amount).toBe("250.00");
    expect(outboxRepo.messages.length).toBe(1);
  });

  it("deve processar LOSS sem alterar o saldo", async () => {
    const result = await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-loss-1",
      kind: WagerTransactionKind.Loss,
      money: { amount: "50.00", currency: "BRL" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance?.amount).toBe("100.00");
  });

  it("deve definir estado PENDING_REFERENCE caso REFUND seja recebido sem a aposta original", async () => {
    const result = await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-refund-orphan",
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: "ext-bet-missing",
    });

    expect(result.status).toBe(WagerTransactionStatus.PendingReference);
  });

  it("deve reverter BET com sucesso ao receber REFUND da aposta correspondente", async () => {
    await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-bet-10",
      kind: WagerTransactionKind.Bet,
      money: { amount: "50.00", currency: "BRL" },
    });

    const result = await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-refund-10",
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: "ext-bet-10",
      money: { amount: "50.00", currency: "BRL" },
    });

    expect(result.status).toBe(WagerTransactionStatus.Processed);
    expect(result.balance?.amount).toBe("100.00");
  });

  it("deve rejeitar reuso da idempotency key quando o payload for divergente", async () => {
    await useCase.execute({
      ...defaultProps,
      externalTransactionId: "ext-bet-100",
      kind: WagerTransactionKind.Bet,
      money: { amount: "20.00", currency: "BRL" },
    });

    expect(
      useCase.execute({
        ...defaultProps,
        externalTransactionId: "ext-bet-100",
        kind: WagerTransactionKind.Bet,
        money: { amount: "999.00", currency: "BRL" },
      }),
    ).rejects.toThrow("Payload conflitante");
  });
});