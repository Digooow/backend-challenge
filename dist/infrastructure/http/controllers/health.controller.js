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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const postgresql_1 = require("@mikro-orm/postgresql");
let HealthController = class HealthController {
    constructor(em) {
        this.em = em;
    }
    checkLiveness() {
        return { status: 'UP', timestamp: new Date().toISOString() };
    }
    async checkReadiness() {
        const checks = {
            database: 'DOWN',
            sqs: 'DOWN',
        };
        let isReady = true;
        try {
            await this.em.getConnection().execute('SELECT 1');
            checks.database = 'UP';
        }
        catch (error) {
            isReady = false;
        }
        try {
            const sqsEndpoint = process.env.SQS_ENDPOINT || 'http://localhost:4566';
            const response = await fetch(`${sqsEndpoint}/_localstack/health`);
            if (response.ok) {
                checks.sqs = 'UP';
            }
            else {
                isReady = false;
            }
        }
        catch (error) {
            isReady = false;
        }
        if (!isReady) {
            throw new common_1.ServiceUnavailableException({
                status: 'DOWN',
                checks,
                timestamp: new Date().toISOString(),
            });
        }
        return {
            status: 'UP',
            checks,
            timestamp: new Date().toISOString(),
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)('live'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "checkLiveness", null);
__decorate([
    (0, common_1.Get)('ready'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkReadiness", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [postgresql_1.EntityManager])
], HealthController);
//# sourceMappingURL=health.controller.js.map