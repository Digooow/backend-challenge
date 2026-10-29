export const LedgerDirection = {
  Debit: "DEBIT",
  Credit: "CREDIT",
} as const;


export type LedgerDirection = keyof typeof LedgerDirection;