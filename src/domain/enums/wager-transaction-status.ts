export const WagerTransactionStatus = {
  Pending: "PENDING",
  PendingReference: "PENDING_REFERENCE",
  Processed: "PROCESSED",
  Rejected: "REJECTED",
  Failed: "FAILED",
} as const;

export type WagerTransactionStatus = (typeof WagerTransactionStatus)[keyof typeof WagerTransactionStatus];
