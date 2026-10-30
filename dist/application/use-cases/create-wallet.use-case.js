"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateWalletUseCase = void 0;
const domain_exception_1 = require("../../domain/exceptions/domain.exception");
const wallet_1 = require("../../domain/entities/wallet");
const money_1 = require("../../domain/value-objects/money");
class CreateWalletUseCase {
    constructor(walletRepo, uow) {
        this.walletRepo = walletRepo;
        this.uow = uow;
    }
    async execute(input) {
        const initialMoney = money_1.Money.from(input.initialBalance);
        return this.uow.transaction(async (tx) => {
            const existingWallet = await this.walletRepo.findByPlayerAndCurrency(input.playerId, initialMoney.currency, tx);
            if (existingWallet) {
                throw new domain_exception_1.DomainException(`Já existe uma carteira cadastrada para o jogador ${input.playerId} com a moeda ${initialMoney.currency}.`);
            }
            const { wallet, openingLedgerEntry } = wallet_1.Wallet.open({
                id: crypto.randomUUID(),
                playerId: input.playerId,
                initialBalance: initialMoney,
            });
            await this.walletRepo.save(wallet, tx);
            if (openingLedgerEntry) {
                await this.walletRepo.saveLedgerEntry(openingLedgerEntry, tx);
            }
            return {
                id: wallet.id,
                playerId: wallet.playerId,
                balance: wallet.balance.toJSON(),
                version: wallet.version,
            };
        });
    }
}
exports.CreateWalletUseCase = CreateWalletUseCase;
//# sourceMappingURL=create-wallet.use-case.js.map