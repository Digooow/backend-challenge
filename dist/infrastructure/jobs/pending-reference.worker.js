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
var PendingReferenceWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingReferenceWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const process_wager_transaction_use_case_1 = require("../../application/use-cases/process-wager-transaction.use-case");
let PendingReferenceWorker = PendingReferenceWorker_1 = class PendingReferenceWorker {
    constructor(wagerTxRepo, useCase, uow) {
        this.wagerTxRepo = wagerTxRepo;
        this.useCase = useCase;
        this.uow = uow;
        this.logger = new common_1.Logger(PendingReferenceWorker_1.name);
        this.isProcessing = false;
    }
    async handle() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        try {
            const pendingTransactions = await this.wagerTxRepo.findPendingReferences(10);
            if (pendingTransactions.length === 0) {
                return;
            }
            this.logger.log(`Encontradas ${pendingTransactions.length} transações aguardando referência. Reprocessando...`);
            for (const tx of pendingTransactions) {
                try {
                    const input = {
                        providerId: tx.providerId,
                        externalTransactionId: tx.externalTransactionId,
                        idempotencyKey: tx.idempotencyKey,
                        playerId: tx.playerId,
                        walletId: tx.walletId,
                        roundId: tx.roundId,
                        gameId: tx.gameId,
                        kind: tx.kind,
                        money: tx.money.toJSON(),
                        referenceExternalTransactionId: tx.referenceExternalTransactionId,
                    };
                    await this.useCase.execute(input);
                    this.logger.log(`Transação pendente ${tx.id} processada com sucesso.`);
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logger.warn(`Transação pendente ${tx.id} falhou ao reprocessar: ${errorMessage}`);
                }
            }
        }
        catch (error) {
            this.logger.error("Erro fatal no PendingReferenceWorker", error);
        }
        finally {
            this.isProcessing = false;
        }
    }
};
exports.PendingReferenceWorker = PendingReferenceWorker;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_10_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PendingReferenceWorker.prototype, "handle", null);
exports.PendingReferenceWorker = PendingReferenceWorker = PendingReferenceWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object, process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase, Object])
], PendingReferenceWorker);
//# sourceMappingURL=pending-reference.worker.js.map