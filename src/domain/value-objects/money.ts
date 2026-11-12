import Big from "big.js";
import { DomainException } from "../exceptions/domain.exception";

export interface MoneyProps {
  amount: string;
  currency: string;
}

export class Money {
  private constructor(
    private readonly value: Big,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!props || typeof props.amount !== "string") {
      throw DomainException.validation("O valor monetário deve ser uma string.");
    }

    if (typeof props.currency !== "string" || !/^[A-Z]{3}$/.test(props.currency)) {
      throw DomainException.validation(
        "Moeda inválida: deve seguir o padrão ISO-4217 (3 letras maiúsculas, ex: 'BRL').",
      );
    }

    if (props.amount.startsWith("-")) {
      throw DomainException.validation(
        "Valores monetários negativos não são permitidos em contratos de entrada.",
      );
    }

    if (!/^\d+\.\d{2}$/.test(props.amount)) {
      throw DomainException.validation("Escala exata de 2 casas exigida (ex: '25.00').");
    }

    try {
      const bigValue = new Big(props.amount);
      return new Money(bigValue, props.currency);
    } catch {
      throw DomainException.validation("Valor financeiro inválido.");
    }
  }

  static zero(currency: string): Money {
    if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) {
      throw DomainException.validation(
        "Moeda inválida: deve seguir o padrão ISO-4217 (3 letras maiúsculas, ex: 'BRL').",
      );
    }
    return new Money(new Big("0.00"), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.times(-1), this.currency);
  }

  isZero(): boolean {
    return this.value.eq(0);
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  isNegative(): boolean {
    return this.value.lt(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lt(other.value);
  }

  equals(other: Money): boolean {
    if (this.currency !== other.currency) return false;
    return this.value.eq(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw DomainException.businessRule(
        `Moedas incompatíveis: ${this.currency} e ${other.currency}`,
        "INVALID_CURRENCY",
      );
    }
  }
}
