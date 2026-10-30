"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletController = void 0;
const common_1 = require("@nestjs/common");
const reconcile_wallet_use_case_1 = require("../../application/use-cases/reconcile-wallet.use-case");
const wallet_1 = require("../../domain/entities/wallet");
const money_1 = require("../../domain/value-objects/money");
const postgresql_1 = require("@mikro-orm/postgresql");
let WalletController = class WalletController {
    constructor(walletRepo, reconcileUseCase, em) {
        this.walletRepo = walletRepo;
        this.reconcileUseCase = reconcileUseCase;
        this.em = em;
    }
    async createWallet(body) {
        const initialBalance = money_1.Money.from(body.initialBalance);
        const { wallet, openingLedgerEntry } = wallet_1.Wallet.open({
            id: crypto.randomUUID(),
            playerId: body.playerId,
            initialBalance,
        });
        await this.em.transactional(async (tx) => {
            await this.walletRepo.save(wallet, tx);
            if (openingLedgerEntry) {
                await this.walletRepo.saveLedgerEntry(openingLedgerEntry, tx);
            }
        });
        return {
            id: wallet.id,
            playerId: wallet.playerId,
            balance: wallet.balance.toJSON(),
            version: wallet.version,
        };
    }
    async getWallet(walletId) {
        const wallet = await this.walletRepo.findById(walletId);
        if (!wallet) {
            throw new common_1.NotFoundException("Wallet not found");
        }
        return {
            id: wallet.id,
            playerId: wallet.playerId,
            balance: wallet.balance.toJSON(),
            version: wallet.version,
        };
    }
    async reconcileWallet(walletId) {
        return this.reconcileUseCase.execute(walletId);
    }
};
exports.WalletController = WalletController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "createWallet", null);
__decorate([
    (0, common_1.Get)(":walletId"),
    __param(0, (0, common_1.Param)("walletId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getWallet", null);
__decorate([
    (0, common_1.Post)(":walletId/reconciliation"),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)("walletId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "reconcileWallet", null);
exports.WalletController = WalletController = __decorate([
    (0, common_1.Controller)("wallets"),
    __param(0, (0, common_1.Inject)('WalletRepositoryPort')),
    __metadata("design:paramtypes", [Object, reconcile_wallet_use_case_1.ReconcileWalletUseCase,
        postgresql_1.EntityManager])
], WalletController);
//# sourceMappingURL=wallet.controller.js.map