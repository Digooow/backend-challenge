export declare const WagerTransactionStatus: {
    readonly Pending: "PENDING";
    readonly PendingReference: "PENDING_REFERENCE";
    readonly Processed: "PROCESSED";
    readonly Rejected: "REJECTED";
    readonly Failed: "FAILED";
};
export type WagerTransactionStatus = (typeof WagerTransactionStatus)[keyof typeof WagerTransactionStatus];
