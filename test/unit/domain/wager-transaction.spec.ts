import { describe, expect, it } from "bun:test";
import { WagerTransaction } from "../../../src/domain/entities/wager-transaction";
import { WagerTransactionKind } from "../../../src/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../../src/domain/enums/wager-transaction-status";
import { FailureCode } from "../../../src/domain/enums/failure-code";
import { Money } from "../../../src/domain/value-objects/money";

describe("WagerTransaction Entity", () => {
  const defaultProps = {
    id: "tx-1",
    providerId: "provider-a",
    externalTransactionId: "ext-1",
    idempotencyKey: "provider-a:ext-1",
    payloadHash: "hash-123",
    walletId: "wallet-1",
    playerId: "player-1",
    roundId: "round-1",
    gameId: "game-1",
    kind: WagerTransactionKind.Bet,
    money: Money.from({ amount: "25.00", currency: "BRL" }),
  };

  it("deve criar uma transação no estado PENDING", () => {
    const tx = WagerTransaction.create(defaultProps);

    expect(tx.status).toBe(WagerTransactionStatus.Pending);
    expect(tx.isTerminal()).toBe(false);
    expect(tx.affectsBalance()).toBe(true);
  });

  it("deve identificar que LOSS não afeta saldo", () => {
    const tx = WagerTransaction.create({
      ...defaultProps,
      kind: WagerTransactionKind.Loss,
    });

    expect(tx.affectsBalance()).toBe(false);
  });

  it("deve exigir referência externa para REFUND e ROLLBACK", () => {
    expect(() =>
      WagerTransaction.create({
        ...defaultProps,
        kind: WagerTransactionKind.Refund,
      })
    ).toThrow("A operação REFUND exige referenceExternalTransactionId.");

    const validRefund = WagerTransaction.create({
      ...defaultProps,
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: "ext-bet-1",
    });

    expect(validRefund.requiresReference()).toBe(true);
  });

  it("deve transitar para PROCESSED e se tornar terminal", () => {
    const tx = WagerTransaction.create(defaultProps);
    tx.markProcessed(undefined);

    expect(tx.status).toBe(WagerTransactionStatus.Processed);
    expect(tx.isTerminal()).toBe(true);
    expect(tx.processedAt).toBeDefined();
  });

  it("deve proibir transição de estado após atingir um estado terminal", () => {
    const tx = WagerTransaction.create(defaultProps);
    tx.reject(FailureCode.InsufficientBalance);

    expect(tx.status).toBe(WagerTransactionStatus.Rejected);
    expect(tx.isTerminal()).toBe(true);

    expect(() => tx.markProcessed(undefined)).toThrow("estado terminal");
  });
});