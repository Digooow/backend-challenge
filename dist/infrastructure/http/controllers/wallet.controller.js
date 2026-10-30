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
const mikro_orm_wallet_repository_1 = require("../../database/repositories/mikro-orm-wallet.repository");
const unit_of_work_1 = require("../../database/unit-of-work");
const wallet_1 = require("../../../domain/entities/wallet");
const money_1 = require("../../../domain/value-objects/money");
let WalletController = class WalletController {
    constructor(walletRepo, uow) {
        this.walletRepo = walletRepo;
        this.uow = uow;
    }
    async createWallet(body) {
        return this.uow.transaction(async (tx) => {
            const existing = await this.walletRepo.findByPlayerAndCurrency(body.playerId, body.initialBalance.currency, tx);
            if (existing) {
                throw new common_1.ConflictException(`Wallet for player ${body.playerId} and currency ${body.initialBalance.currency} already exists.`);
            }
            const { wallet, openingLedgerEntry } = wallet_1.Wallet.open({
                id: crypto.randomUUID(),
                playerId: body.playerId,
                initialBalance: money_1.Money.from(body.initialBalance),
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
    async getWallet(walletId) {
        const wallet = await this.walletRepo.findById(walletId);
        if (!wallet)
            throw new common_1.NotFoundException('Wallet not found');
        return {
            id: wallet.id,
            playerId: wallet.playerId,
            balance: wallet.balance.toJSON(),
            version: wallet.version,
        };
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
    (0, common_1.Get)(':walletId'),
    __param(0, (0, common_1.Param)('walletId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "getWallet", null);
exports.WalletController = WalletController = __decorate([
    (0, common_1.Controller)('wallets'),
    __metadata("design:paramtypes", [mikro_orm_wallet_repository_1.MikroOrmWalletRepository,
        unit_of_work_1.MikroOrmUnitOfWork])
], WalletController);
//# sourceMappingURL=wallet.controller.js.map