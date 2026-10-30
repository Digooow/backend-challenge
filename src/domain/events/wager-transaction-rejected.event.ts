import { IntegrationEvent, EventContext } from "./integration-event";
import { WagerTransaction } from "../entities/wager-transaction";
import { MoneyProps } from "../value-objects/money";
import { WagerTransactionKind } from "../enums/wager-transaction-kind";
import { FailureCode } from "../enums/failure-code";

export interface WagerTransactionRejectedData {
  transactionId: string;
  walletId: string;
  playerId: string;
  providerId: string;
  externalTransactionId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  failureCode?: FailureCode;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  readonly eventType = "WagerTransactionRejected";
  readonly version = 1;

  static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
    return new WagerTransactionRejected({
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
        failureCode: tx.failureCode,
      },
    });
  }
}

