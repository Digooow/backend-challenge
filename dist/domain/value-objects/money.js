"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Money = void 0;
const big_js_1 = require("big.js");
const domain_exception_1 = require("../exceptions/domain.exception");
class Money {
    constructor(value, currency) {
        this.value = value;
        this.currency = currency;
    }
    static from(props) {
        if (typeof props.amount !== "string") {
            throw new domain_exception_1.DomainException("O valor monetário deve ser uma string.");
        }
        if (!/^-?\d+\.\d{2}$/.test(props.amount)) {
            throw new domain_exception_1.DomainException("Escala exata de 2 casas exigida (ex: '25.00').");
        }
        try {
            const bigValue = new big_js_1.default(props.amount);
            return new Money(bigValue, props.currency);
        }
        catch {
            throw new domain_exception_1.DomainException("Valor financeiro inválido.");
        }
    }
    static zero(currency) {
        return new Money(new big_js_1.default("0.00"), currency);
    }
    add(other) {
        this.assertSameCurrency(other);
        return new Money(this.value.plus(other.value), this.currency);
    }
    subtract(other) {
        this.assertSameCurrency(other);
        return new Money(this.value.minus(other.value), this.currency);
    }
    negate() {
        return new Money(this.value.times(-1), this.currency);
    }
    isZero() {
        return this.value.eq(0);
    }
    isPositive() {
        return this.value.gt(0);
    }
    isNegative() {
        return this.value.lt(0);
    }
    isLessThan(other) {
        this.assertSameCurrency(other);
        return this.value.lt(other.value);
    }
    equals(other) {
        if (this.currency !== other.currency)
            return false;
        return this.value.eq(other.value);
    }
    toJSON() {
        return {
            amount: this.toString(),
            currency: this.currency,
        };
    }
    toString() {
        return this.value.toFixed(2);
    }
    assertSameCurrency(other) {
        if (this.currency !== other.currency) {
            throw new domain_exception_1.DomainException(`Moedas incompatíveis: ${this.currency} e ${other.currency}`);
        }
    }
}
exports.Money = Money;
//# sourceMappingURL=money.js.map