import { ConsoleLogger, Injectable } from "@nestjs/common";
import { RequestContext } from "./request-context";

@Injectable()
export class JsonLoggerService extends ConsoleLogger {
  log(message: any, context?: string) {
    this.printJson("INFO", message, context);
  }

  error(message: any, stack?: any, context?: string) {
    const normalizedStack =
      stack instanceof Error ? stack.stack ?? stack.message : typeof stack === "string" ? stack : undefined;
    this.printJson("ERROR", message, context, normalizedStack);
  }

  warn(message: any, context?: string) {
    this.printJson("WARN", message, context);
  }

  debug(message: any, context?: string) {
    this.printJson("DEBUG", message, context);
  }

  private printJson(level: string, message: any, context?: string, stack?: string) {
    const telemetryCtx = RequestContext.get() ?? ({} as Record<string, unknown>);
    const logObject =
      message instanceof Error
        ? { message: message.message, stack: message.stack }
        : typeof message === "object" && message !== null
          ? { ...message }
          : { message: String(message) };

    const output: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: context || this.context || "Application",
      ...telemetryCtx,
      ...logObject,
      ...(stack ? { stack } : {}),
    };

    // Removemos chaves com dados sensíveis ou payloads financeiros completos (Seção 12)
    delete output.money;
    delete output.initialBalance;
    delete output.password;
    delete output.secret;
    delete output.authorization;

    console.log(JSON.stringify(output));
  }
}