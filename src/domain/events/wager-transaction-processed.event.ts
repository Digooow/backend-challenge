import { IntegrationEvent, EventContext } from "./integration-event";
import { WagerTransaction } from "../entities/wager-transaction";
import { MoneyProps } from "../value-objects/money";
import { WagerTransactionKind } from "../enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../enums/wager-transaction-status";

export interface WagerTransactionProcessedData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  externalTransactionId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  status: WagerTransactionStatus;
  referenceExternalTransactionId?: string;
  referenceTransactionId?: string;
  processedAt?: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = "WagerTransactionProcessed";
  readonly version = 1;

  static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      aggregateId: tx.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      data: {
        transactionId: tx.id,
        walletId: tx.walletId,
        playerId: tx.playerId,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        roundId: tx.roundId,
        gameId: tx.gameId,
        kind: tx.kind,
        money: tx.money.toJSON(),
        status: tx.status,
        referenceExternalTransactionId: tx.referenceExternalTransactionId,
        referenceTransactionId: tx.referenceTransactionId,
        processedAt: tx.processedAt?.toISOString(),
      },
    });
  }
}

