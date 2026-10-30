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
        return { status: "UP", timestamp: new Date().toISOString() };
    }
    async checkReadiness() {
        try {
            await this.em.getConnection().execute('SELECT 1');
            return { status: "READY", database: "UP", timestamp: new Date().toISOString() };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { status: "DOWN", database: "DOWN", timestamp: new Date().toISOString(), error: errorMessage };
        }
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)("live"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "checkLiveness", null);
__decorate([
    (0, common_1.Get)("ready"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "checkReadiness", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)("health"),
    __metadata("design:paramtypes", [postgresql_1.EntityManager])
], HealthController);
//# sourceMappingURL=health.controller.js.map