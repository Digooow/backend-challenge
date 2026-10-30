export declare const LedgerDirection: {
    readonly Debit: "DEBIT";
    readonly Credit: "CREDIT";
};
export type LedgerDirection = (typeof LedgerDirection)[keyof typeof LedgerDirection];
