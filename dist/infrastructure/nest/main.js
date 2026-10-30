"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const domain_exception_filter_1 = require("../../presentation/filters/domain-exception.filter");
const common_1 = require("@nestjs/common");
const json_logger_service_1 = require("../observability/json-logger.service");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        bufferLogs: true,
    });
    app.useLogger(app.get(json_logger_service_1.JsonLoggerService));
    app.useGlobalFilters(new domain_exception_filter_1.DomainExceptionFilter());
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: true }));
    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`Jungle Gaming backend running on port ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map