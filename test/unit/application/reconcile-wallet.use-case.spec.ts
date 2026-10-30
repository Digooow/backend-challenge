import { describe, expect, it } from "bun:test";
import { ReconcileWalletUseCase } from "../../../src/application/use-cases/reconcile-wallet.use-case";
import { Wallet } from "../../../src/domain/entities/wallet";
import { Money } from "../../../src/domain/value-objects/money";
import { WalletRepositoryPort } from "../../../src/application/ports/wallet.repository";
import { WalletLedgerEntry } from "../../../src/domain/entities/wallet-ledger-entry";

class MockWalletRepo implements WalletRepositoryPort {
  wallet?: Wallet;
  entries: WalletLedgerEntry[] = [];

  async findById(id: string): Promise<Wallet | null> {
    return this.wallet?.id === id ? this.wallet : null;
  }

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    return this.findById(id);
  }

  async findByPlayerAndCurrency(): Promise<Wallet | null> {
    return null;
  }

  async save(): Promise<void> {}

  async saveLedgerEntry(): Promise<void> {}

  async getLedgerEntries(): Promise<WalletLedgerEntry[]> {
    return this.entries;
  }
}

describe("ReconcileWalletUseCase", () => {
  it("deve confirmar consistência quando o saldo é igual à soma do ledger", async () => {
    const repo = new MockWalletRepo();
    const { wallet, openingLedgerEntry } = Wallet.open({
      id: "wallet-1",
      playerId: "p1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    repo.wallet = wallet;
    if (openingLedgerEntry) repo.entries.push(openingLedgerEntry);

    const useCase = new ReconcileWalletUseCase(repo);
    const result = await useCase.execute("wallet-1");

    expect(result.consistent).toBe(true);
    expect(result.difference.amount).toBe("0.00");
  });

  it("deve indicar inconsistência quando o saldo difere da soma do ledger", async () => {
    const repo = new MockWalletRepo();
    const { wallet } = Wallet.open({
      id: "wallet-2",
      playerId: "p2",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    repo.wallet = wallet;
    // Nenhuma entrada no ledger -> soma zerada contra saldo de R$ 100.00

    const useCase = new ReconcileWalletUseCase(repo);
    const result = await useCase.execute("wallet-2");

    expect(result.consistent).toBe(false);
    expect(result.difference.amount).toBe("100.00");
  });
});