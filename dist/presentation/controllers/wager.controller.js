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
const process_wager_transaction_use_case_1 = require("../../application/use-cases/process-wager-transaction.use-case");
let WagerController = class WagerController {
    constructor(processWagerUseCase) {
        this.processWagerUseCase = processWagerUseCase;
    }
    async processTransaction(idempotencyKey, payload) {
        if (!idempotencyKey) {
            throw new common_1.BadRequestException("Header 'Idempotency-Key' is required");
        }
        const input = {
            ...payload,
            idempotencyKey,
        };
        const result = await this.processWagerUseCase.execute(input);
        return result;
    }
};
exports.WagerController = WagerController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Headers)("Idempotency-Key")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WagerController.prototype, "processTransaction", null);
exports.WagerController = WagerController = __decorate([
    (0, common_1.Controller)("wagering/transactions"),
    __metadata("design:paramtypes", [process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase])
], WagerController);
//# sourceMappingURL=wager.controller.js.map