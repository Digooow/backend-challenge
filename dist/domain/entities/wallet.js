"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Wallet = void 0;
const domain_exception_1 = require("../exceptions/domain.exception");
const money_1 = require("../value-objects/money");
const wallet_ledger_entry_1 = require("./wallet-ledger-entry");
class Wallet {
    constructor(id, playerId, currency, _balance, _version, createdAt, _updatedAt) {
        this.id = id;
        this.playerId = playerId;
        this.currency = currency;
        this._balance = _balance;
        this._version = _version;
        this.createdAt = createdAt;
        this._updatedAt = _updatedAt;
    }
    static open(props) {
        const now = props.createdAt ?? new Date();
        const currency = props.initialBalance.currency;
        if (props.initialBalance.isNegative()) {
            throw new domain_exception_1.DomainException("Saldo inicial da carteira não pode ser negativo.");
        }
        const wallet = new Wallet(props.id, props.playerId, currency, props.initialBalance, 1, now, now);
        let openingLedgerEntry;
        if (props.initialBalance.isPositive()) {
            const zeroBalance = money_1.Money.zero(currency);
            openingLedgerEntry = wallet_ledger_entry_1.WalletLedgerEntry.create({
                id: crypto.randomUUID(),
                walletId: wallet.id,
                transactionId: crypto.randomUUID(),
                direction: wallet_ledger_entry_1.LedgerDirection.Credit,
                money: props.initialBalance,
                balanceBefore: zeroBalance,
                balanceAfter: props.initialBalance,
                createdAt: now,
            });
        }
        return { wallet, openingLedgerEntry };
    }
    static rehydrate(state) {
        return new Wallet(state.id, state.playerId, state.currency, state.balance, state.version, state.createdAt, state.updatedAt);
    }
    get balance() {
        return this._balance;
    }
    get version() {
        return this._version;
    }
    get updatedAt() {
        return this._updatedAt;
    }
    debit(amount, transactionId, ledgerEntryId) {
        this.assertSameCurrency(amount);
        if (amount.isNegative() || amount.isZero()) {
            throw new domain_exception_1.DomainException("O valor do débito deve ser estritamente positivo.");
        }
        if (this._balance.isLessThan(amount)) {
            throw new domain_exception_1.DomainException("Saldo insuficiente para realizar a operação.");
        }
        const balanceBefore = this._balance;
        const balanceAfter = this._balance.subtract(amount);
        this._balance = balanceAfter;
        this._version += 1;
        this._updatedAt = new Date();
        const ledgerEntry = wallet_ledger_entry_1.WalletLedgerEntry.create({
            id: ledgerEntryId ?? crypto.randomUUID(),
            walletId: this.id,
            transactionId,
            direction: wallet_ledger_entry_1.LedgerDirection.Debit,
            money: amount,
            balanceBefore,
            balanceAfter,
            createdAt: this._updatedAt,
        });
        return { ledgerEntry };
    }
    credit(amount, transactionId, ledgerEntryId) {
        this.assertSameCurrency(amount);
        if (amount.isNegative() || amount.isZero()) {
            throw new domain_exception_1.DomainException("O valor do crédito deve ser estritamente positivo.");
        }
        const balanceBefore = this._balance;
        const balanceAfter = this._balance.add(amount);
        this._balance = balanceAfter;
        this._version += 1;
        this._updatedAt = new Date();
        const ledgerEntry = wallet_ledger_entry_1.WalletLedgerEntry.create({
            id: ledgerEntryId ?? crypto.randomUUID(),
            walletId: this.id,
            transactionId,
            direction: wallet_ledger_entry_1.LedgerDirection.Credit,
            money: amount,
            balanceBefore,
            balanceAfter,
            createdAt: this._updatedAt,
        });
        return { ledgerEntry };
    }
    assertSameCurrency(money) {
        if (this.currency !== money.currency) {
            throw new domain_exception_1.DomainException(`Operação rejeitada: moeda ${money.currency} incompatível com a carteira ${this.currency}.`);
        }
    }
}
exports.Wallet = Wallet;
//# sourceMappingURL=wallet.js.map