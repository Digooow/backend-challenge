import { Injectable } from "@nestjs/common";

export interface SystemMetrics {
  transactionsByStatus: Record<string, number>;
  duplicatesDetected: number;
  retriesTotal: number;
  dlqMessagesTotal: number;
  lockConflictsTotal: number;
  outboxLag: number;
  lastProcessingLatencyMs: number;
  averageLatencyMs: number;
}

@Injectable()
export class MetricsService {
  private readonly transactionsByStatus: Record<string, number> = {
    PROCESSED: 0,
    REJECTED: 0,
    PENDING_REFERENCE: 0,
    FAILED: 0,
  };

  private duplicatesDetected = 0;
  private retriesTotal = 0;
  private dlqMessagesTotal = 0;
  private lockConflictsTotal = 0;
  private outboxLag = 0;
  private latencies: number[] = [];

  incrementTransaction(status: string) {
    this.transactionsByStatus[status] = (this.transactionsByStatus[status] || 0) + 1;
  }

  incrementDuplicate() {
    this.duplicatesDetected++;
  }

  incrementRetry() {
    this.retriesTotal++;
  }

  incrementDlq() {
    this.dlqMessagesTotal++;
  }

  incrementLockConflict() {
    this.lockConflictsTotal++;
  }

  setOutboxLag(lag: number) {
    this.outboxLag = lag;
  }

  recordLatency(ms: number) {
    this.latencies.push(ms);
    if (this.latencies.length > 500) {
      this.latencies.shift();
    }
  }

  getMetrics(): SystemMetrics {
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    const avg = this.latencies.length > 0 ? sum / this.latencies.length : 0;
    const last = this.latencies.length > 0 ? this.latencies[this.latencies.length - 1] : 0;

    return {
      transactionsByStatus: { ...this.transactionsByStatus },
      duplicatesDetected: this.duplicatesDetected,
      retriesTotal: this.retriesTotal,
      dlqMessagesTotal: this.dlqMessagesTotal,
      lockConflictsTotal: this.lockConflictsTotal,
      outboxLag: this.outboxLag,
      lastProcessingLatencyMs: Number(last.toFixed(2)),
      averageLatencyMs: Number(avg.toFixed(2)),
    };
  }
}

