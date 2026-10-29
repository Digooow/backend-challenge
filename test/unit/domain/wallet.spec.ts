import { describe, expect, it } from "bun:test";
import { Wallet } from "../../../src/domain/entities/wallet";
import { Money } from "../../../src/domain/value-objects/money";
import { LedgerDirection } from "../../../src/domain/entities/wallet-ledger-entry";

describe("Wallet Aggregate Root", () => {
  it("deve abrir uma carteira com saldo inicial zero e version 1", () => {
    const { wallet, openingLedgerEntry } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.zero("BRL"),
    });

    expect(wallet.balance.toString()).toBe("0.00");
    expect(wallet.version).toBe(1);
    expect(openingLedgerEntry).toBeUndefined();
  });

  it("deve abrir carteira com saldo inicial e gerar o lançamento de abertura no ledger", () => {
    const { wallet, openingLedgerEntry } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    expect(wallet.balance.toString()).toBe("100.00");
    expect(wallet.version).toBe(1);
    expect(openingLedgerEntry).toBeDefined();
    expect(openingLedgerEntry?.direction).toBe(LedgerDirection.Credit);
    expect(openingLedgerEntry?.balanceBefore.toString()).toBe("0.00");
    expect(openingLedgerEntry?.balanceAfter.toString()).toBe("100.00");
  });

  it("deve realizar débito, atualizar o saldo, incrementar a version e gerar entrada no ledger", () => {
    const { wallet } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    const { ledgerEntry } = wallet.debit(
      Money.from({ amount: "40.00", currency: "BRL" }),
      "tx-bet-1"
    );

    expect(wallet.balance.toString()).toBe("60.00");
    expect(wallet.version).toBe(2);
    expect(ledgerEntry.direction).toBe(LedgerDirection.Debit);
    expect(ledgerEntry.balanceBefore.toString()).toBe("100.00");
    expect(ledgerEntry.balanceAfter.toString()).toBe("60.00");
  });

  it("deve rejeitar débito caso o saldo seja insuficiente", () => {
    const { wallet } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "50.00", currency: "BRL" }),
    });

    expect(() =>
      wallet.debit(Money.from({ amount: "80.00", currency: "BRL" }), "tx-bet-2")
    ).toThrow("Saldo insuficiente");

    expect(wallet.balance.toString()).toBe("50.00"); // Saldo deve continuar intacto
    expect(wallet.version).toBe(1); // Version não altera
  });

  it("deve rejeitar operações com moeda incompatível", () => {
    const { wallet } = Wallet.open({
      id: "wallet-1",
      playerId: "player-1",
      initialBalance: Money.from({ amount: "100.00", currency: "BRL" }),
    });

    expect(() =>
      wallet.debit(Money.from({ amount: "10.00", currency: "USD" }), "tx-bet-3")
    ).toThrow("moeda USD incompatível com a carteira BRL");
  });
});