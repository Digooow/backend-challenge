"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconcileWalletUseCase = void 0;
const domain_exception_1 = require("../../domain/exceptions/domain.exception");
const money_1 = require("../../domain/value-objects/money");
const ledger_direction_1 = require("../../domain/enums/ledger-direction");
class ReconcileWalletUseCase {
    constructor(walletRepo) {
        this.walletRepo = walletRepo;
    }
    async execute(walletId) {
        const wallet = await this.walletRepo.findById(walletId);
        if (!wallet) {
            throw new domain_exception_1.DomainException(`Carteira ${walletId} não encontrada.`);
        }
        const entries = await this.walletRepo.getLedgerEntries(walletId);
        let calculated = money_1.Money.zero(wallet.currency);
        for (const entry of entries) {
            if (entry.direction === ledger_direction_1.LedgerDirection.Credit) {
                calculated = calculated.add(entry.money);
            }
            else {
                calculated = calculated.subtract(entry.money);
            }
        }
        const difference = wallet.balance.subtract(calculated);
        const consistent = difference.isZero();
        return {
            walletId: wallet.id,
            storedBalance: wallet.balance.toJSON(),
            calculatedBalance: calculated.toJSON(),
            difference: difference.toJSON(),
            consistent,
            checkedEntries: entries.length,
        };
    }
}
exports.ReconcileWalletUseCase = ReconcileWalletUseCase;
//# sourceMappingURL=reconcile-wallet.use-case.js.map