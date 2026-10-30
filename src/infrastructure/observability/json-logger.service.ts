import { ConsoleLogger, Injectable } from '@nestjs/common';

@Injectable()
export class JsonLoggerService extends ConsoleLogger {
  log(message: any, context?: string) {
    this.printJson('INFO', message, context);
  }

  error(message: any, stack?: string, context?: string) {
    this.printJson('ERROR', message, context, stack);
  }

  warn(message: any, context?: string) {
    this.printJson('WARN', message, context);
  }

  debug(message: any, context?: string) {
    this.printJson('DEBUG', message, context);
  }

  private printJson(level: string, message: any, context?: string, stack?: string) {
    // Se a mensagem for um objeto, extraímos as propriedades, senão colocamos num campo 'message'
    const logObject = typeof message === 'object' ? message : { message };
    
    const output = {
      timestamp: new Date().toISOString(),
      level,
      context: context || this.context,
      ...logObject,
      ...(stack ? { stack } : {}),
    };

    // Removemos chaves com dados sensíveis de payload completo, se existirem
    delete output.money;
    delete output.password;

    console.log(JSON.stringify(output));
  }
}