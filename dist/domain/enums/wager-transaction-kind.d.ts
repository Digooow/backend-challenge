export declare const WagerTransactionKind: {
    readonly Opening: "OPENING";
    readonly Bet: "BET";
    readonly Win: "WIN";
    readonly Loss: "LOSS";
    readonly Refund: "REFUND";
    readonly Rollback: "ROLLBACK";
};
export type WagerTransactionKind = (typeof WagerTransactionKind)[keyof typeof WagerTransactionKind];
