"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ProviderAuthGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderAuthGuard = void 0;
const common_1 = require("@nestjs/common");
let ProviderAuthGuard = ProviderAuthGuard_1 = class ProviderAuthGuard {
    constructor() {
        this.logger = new common_1.Logger(ProviderAuthGuard_1.name);
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const providerId = request.headers['x-provider-id'] || 'provider-default';
        request.user = { providerId };
        this.logger.debug(`AuthGuard No-op: Request allowed for provider [${providerId}]`);
        return true;
    }
};
exports.ProviderAuthGuard = ProviderAuthGuard;
exports.ProviderAuthGuard = ProviderAuthGuard = ProviderAuthGuard_1 = __decorate([
    (0, common_1.Injectable)()
], ProviderAuthGuard);
//# sourceMappingURL=provider-auth.guard.js.map