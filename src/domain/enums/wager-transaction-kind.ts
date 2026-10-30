export const WagerTransactionKind = {
  Opening: "OPENING",
  Bet: "BET",
  Win: "WIN",
  Loss: "LOSS",
  Refund: "REFUND",
  Rollback: "ROLLBACK",
} as const;

export type WagerTransactionKind = (typeof WagerTransactionKind)[keyof typeof WagerTransactionKind];
