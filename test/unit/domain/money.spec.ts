import { describe, expect, it } from "bun:test";
import { Money } from "../../../src/domain/value-objects/money";

describe("Money Value Object", () => {
  it("deve criar uma instância válida e manter 2 casas decimais", () => {
    const money = Money.from({ amount: "25.00", currency: "BRL" });
    expect(money.toString()).toBe("25.00");
    expect(money.currency).toBe("BRL");
  });

  it("deve rejeitar entradas inválidas (números, notação científica, escala incorreta)", () => {
    // @ts-expect-error - Testando bloqueio do TypeScript contra number
    expect(() => Money.from({ amount: 25.00, currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "25", currency: "BRL" })).toThrow("Escala exata de 2 casas exigida");
    expect(() => Money.from({ amount: "NaN", currency: "BRL" })).toThrow();
    expect(() => Money.from({ amount: "25.001", currency: "BRL" })).toThrow("Escala exata de 2 casas exigida");
  });

  it("deve realizar adição mantendo a imutabilidade", () => {
    const base = Money.from({ amount: "100.00", currency: "BRL" });
    const added = base.add(Money.from({ amount: "50.50", currency: "BRL" }));

    expect(base.toString()).toBe("100.00");
    expect(added.toString()).toBe("150.50");
  });

  it("deve realizar subtração sem quebrar a imutabilidade", () => {
    const base = Money.from({ amount: "100.00", currency: "BRL" });
    const subtracted = base.subtract(Money.from({ amount: "150.00", currency: "BRL" }));

    expect(subtracted.toString()).toBe("-50.00");
    expect(subtracted.isNegative()).toBe(true);
  });

  it("deve lançar erro ao operar moedas diferentes", () => {
    const brl = Money.from({ amount: "10.00", currency: "BRL" });
    const usd = Money.from({ amount: "10.00", currency: "USD" });

    expect(() => brl.add(usd)).toThrow("Moedas incompatíveis");
  });
});