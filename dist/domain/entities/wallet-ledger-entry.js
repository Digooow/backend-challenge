"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletLedgerEntry = exports.LedgerDirection = void 0;
const domain_exception_1 = require("../exceptions/domain.exception");
const ledger_direction_1 = require("../enums/ledger-direction");
Object.defineProperty(exports, "LedgerDirection", { enumerable: true, get: function () { return ledger_direction_1.LedgerDirection; } });
class WalletLedgerEntry {
    constructor(id, walletId, transactionId, direction, money, balanceBefore, balanceAfter, createdAt) {
        this.id = id;
        this.walletId = walletId;
        this.transactionId = transactionId;
        this.direction = direction;
        this.money = money;
        this.balanceBefore = balanceBefore;
        this.balanceAfter = balanceAfter;
        this.createdAt = createdAt;
    }
    static create(props) {
        const createdAt = props.createdAt ?? new Date();
        const entry = new WalletLedgerEntry(props.id, props.walletId, props.transactionId, props.direction, props.money, props.balanceBefore, props.balanceAfter, createdAt);
        if (!entry.isBalanced()) {
            throw new domain_exception_1.DomainException(`Aritmética do ledger inconsistente: ${props.balanceBefore.toString()} ${props.direction === ledger_direction_1.LedgerDirection.Credit ? '+' : '-'} ${props.money.toString()} !== ${props.balanceAfter.toString()}`);
        }
        return entry;
    }
    static rehydrate(state) {
        return new WalletLedgerEntry(state.id, state.walletId, state.transactionId, state.direction, state.money, state.balanceBefore, state.balanceAfter, state.createdAt);
    }
    isBalanced() {
        if (this.direction === ledger_direction_1.LedgerDirection.Credit) {
            return this.balanceBefore.add(this.money).equals(this.balanceAfter);
        }
        return this.balanceBefore.subtract(this.money).equals(this.balanceAfter);
    }
}
exports.WalletLedgerEntry = WalletLedgerEntry;
//# sourceMappingURL=wallet-ledger-entry.js.map