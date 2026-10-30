export const FailureCode = {
  InsufficientBalance: "INSUFFICIENT_BALANCE",
  InvalidCurrency: "INVALID_CURRENCY",
  ReferenceNotFound: "REFERENCE_NOT_FOUND",
  InvalidReferenceKind: "INVALID_REFERENCE_KIND",
  ReferenceAlreadyReverted: "REFERENCE_ALREADY_REVERTED",
  InvalidAmount: "INVALID_AMOUNT",
  PayloadMismatch: "PAYLOAD_MISMATCH",
  DuplicateTransaction: "DUPLICATE_TRANSACTION",
  InternalError: "INTERNAL_ERROR",
  NegativeBalanceProduced: "NEGATIVE_BALANCE_PRODUCED",
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];
