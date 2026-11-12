export interface MetricsPort {
  incrementTransaction(status: string): void;
  incrementDuplicate(): void;
  incrementRetry(): void;
  incrementDlq(): void;
  incrementLockConflict(): void;
  incrementReconciliationDiscrepancy(): void;
  setOutboxLag(lag: number): void;
  recordLatency(ms: number): void;
}
