export const WagerTransactionKind = {
  Opening: "OPENING",
  Bet: "BET",
  Win: "WIN",
  Loss: "LOSS",
  Refund: "REFUND",
  Rollback: "ROLLBACK",
} as const;

export type WagerTransactionKind = keyof typeof WagerTransactionKind;
