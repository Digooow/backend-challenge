export const WagerTransactionStatus = {
  Pending: "PENDING",
  PendingReference: "PENDING_REFERENCE",
  Processed: "PROCESSED",
  Rejected: "REJECTED",
  Failed: "FAILED",
} as const;

export type WagerTransactionStatus = keyof typeof WagerTransactionStatus;
