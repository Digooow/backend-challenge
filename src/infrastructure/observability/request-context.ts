import { AsyncLocalStorage } from "node:async_hooks";

export interface TelemetryContext {
  correlationId: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  providerId?: string;
}

export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<TelemetryContext>();

  static run<T>(context: TelemetryContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  static get(): TelemetryContext | undefined {
    return this.storage.getStore();
  }

  static merge(partial: Partial<TelemetryContext>): void {
    const current = this.storage.getStore();
    if (current) {
      Object.assign(current, partial);
    }
  }
}
