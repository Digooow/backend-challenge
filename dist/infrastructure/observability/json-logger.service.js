"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonLoggerService = void 0;
const common_1 = require("@nestjs/common");
let JsonLoggerService = class JsonLoggerService extends common_1.ConsoleLogger {
    log(message, context) {
        this.printJson('INFO', message, context);
    }
    error(message, stack, context) {
        this.printJson('ERROR', message, context, stack);
    }
    warn(message, context) {
        this.printJson('WARN', message, context);
    }
    debug(message, context) {
        this.printJson('DEBUG', message, context);
    }
    printJson(level, message, context, stack) {
        const logObject = typeof message === 'object' ? message : { message };
        const output = {
            timestamp: new Date().toISOString(),
            level,
            context: context || this.context,
            ...logObject,
            ...(stack ? { stack } : {}),
        };
        delete output.money;
        delete output.password;
        console.log(JSON.stringify(output));
    }
};
exports.JsonLoggerService = JsonLoggerService;
exports.JsonLoggerService = JsonLoggerService = __decorate([
    (0, common_1.Injectable)()
], JsonLoggerService);
//# sourceMappingURL=json-logger.service.js.map