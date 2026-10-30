export declare const FailureCode: {
    readonly InsufficientBalance: "INSUFFICIENT_BALANCE";
    readonly InvalidCurrency: "INVALID_CURRENCY";
    readonly ReferenceNotFound: "REFERENCE_NOT_FOUND";
    readonly InvalidReferenceKind: "INVALID_REFERENCE_KIND";
    readonly ReferenceAlreadyReverted: "REFERENCE_ALREADY_REVERTED";
    readonly InvalidAmount: "INVALID_AMOUNT";
    readonly PayloadMismatch: "PAYLOAD_MISMATCH";
    readonly DuplicateTransaction: "DUPLICATE_TRANSACTION";
    readonly InternalError: "INTERNAL_ERROR";
    readonly NegativeBalanceProduced: "NEGATIVE_BALANCE_PRODUCED";
};
export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];
