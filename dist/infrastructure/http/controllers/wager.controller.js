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
exports.WagerController = void 0;
const common_1 = require("@nestjs/common");
const process_wager_transaction_use_case_1 = require("../../../application/use-cases/process-wager-transaction.use-case");
const wager_dto_1 = require("../dtos/wager.dto");
const wager_transaction_status_1 = require("../../../domain/enums/wager-transaction-status");
const provider_auth_guard_1 = require("../guards/provider-auth.guard");
let WagerController = class WagerController {
    constructor(processWagerUseCase) {
        this.processWagerUseCase = processWagerUseCase;
    }
    async processTransaction(idempotencyKey, dto) {
        if (!idempotencyKey) {
            throw new common_1.HttpException('Idempotency-Key header is required', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const result = await this.processWagerUseCase.execute({
                ...dto,
                idempotencyKey,
            });
            switch (result.status) {
                case wager_transaction_status_1.WagerTransactionStatus.Processed:
                    return result;
                case wager_transaction_status_1.WagerTransactionStatus.Rejected:
                    throw new common_1.HttpException(result, common_1.HttpStatus.UNPROCESSABLE_ENTITY);
                case wager_transaction_status_1.WagerTransactionStatus.PendingReference:
                    throw new common_1.HttpException(result, common_1.HttpStatus.ACCEPTED);
                case wager_transaction_status_1.WagerTransactionStatus.Failed:
                    throw new common_1.HttpException(result, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
                default:
                    return result;
            }
        }
        catch (error) {
            if (error.message === 'Payload conflitante') {
                throw new common_1.HttpException({ error: 'Idempotency Key Conflict' }, common_1.HttpStatus.CONFLICT);
            }
            throw error;
        }
    }
};
exports.WagerController = WagerController;
__decorate([
    (0, common_1.Post)('transactions'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Headers)('idempotency-key')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, wager_dto_1.ProcessWagerRequestDto]),
    __metadata("design:returntype", Promise)
], WagerController.prototype, "processTransaction", null);
exports.WagerController = WagerController = __decorate([
    (0, common_1.Controller)('wagering'),
    (0, common_1.UseGuards)(provider_auth_guard_1.ProviderAuthGuard),
    __metadata("design:paramtypes", [process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase])
], WagerController);
//# sourceMappingURL=wager.controller.js.map