import { ConsoleLogger } from '@nestjs/common';
export declare class JsonLoggerService extends ConsoleLogger {
    log(message: any, context?: string): void;
    error(message: any, stack?: string, context?: string): void;
    warn(message: any, context?: string): void;
    debug(message: any, context?: string): void;
    private printJson;
}
