"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletBalanceChanged = void 0;
const integration_event_1 = require("./integration-event");
class WalletBalanceChanged extends integration_event_1.IntegrationEvent {
    constructor() {
        super(...arguments);
        this.eventType = "WalletBalanceChanged";
        this.version = 1;
    }
    static from(wallet, entry, ctx) {
        return new WalletBalanceChanged({
            aggregateId: wallet.id,
            correlationId: ctx.correlationId,
            causationId: ctx.causationId,
            data: {
                walletId: wallet.id,
                transactionId: entry.transactionId,
                direction: entry.direction,
                money: entry.money.toJSON(),
                balanceBefore: entry.balanceBefore.toJSON(),
                balanceAfter: entry.balanceAfter.toJSON(),
                walletVersion: wallet.version,
            },
        });
    }
}
exports.WalletBalanceChanged = WalletBalanceChanged;
//# sourceMappingURL=wallet-balance-changed.event.js.map