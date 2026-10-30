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
var OutboxRelayWorker_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxRelayWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const outbox_publisher_1 = require("../messaging/outbox/outbox.publisher");
let OutboxRelayWorker = OutboxRelayWorker_1 = class OutboxRelayWorker {
    constructor(outboxPublisher) {
        this.outboxPublisher = outboxPublisher;
        this.logger = new common_1.Logger(OutboxRelayWorker_1.name);
        this.isProcessing = false;
    }
    async handle() {
        if (this.isProcessing) {
            return;
        }
        this.isProcessing = true;
        try {
            await this.outboxPublisher.processPendingMessages(20);
        }
        catch (error) {
            this.logger.error("Erro fatal durante o Outbox Relay", error);
        }
        finally {
            this.isProcessing = false;
        }
    }
};
exports.OutboxRelayWorker = OutboxRelayWorker;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OutboxRelayWorker.prototype, "handle", null);
exports.OutboxRelayWorker = OutboxRelayWorker = OutboxRelayWorker_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [outbox_publisher_1.OutboxPublisher])
], OutboxRelayWorker);
//# sourceMappingURL=outbox-relay.worker.js.map