import { Injectable } from "@nestjs/common";

export interface SystemMetrics {
  transactionsByStatus: Record<string, number>;
  duplicatesDetected: number;
  retriesTotal: number;
  dlqMessagesTotal: number;
  lockConflictsTotal: number;
  reconciliationDiscrepanciesTotal: number;
  outboxLag: number;
  lastProcessingLatencyMs: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
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
  private reconciliationDiscrepanciesTotal = 0;
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

  incrementReconciliationDiscrepancy() {
    this.reconciliationDiscrepanciesTotal++;
  }

  setOutboxLag(lag: number) {
    this.outboxLag = lag;
  }

  recordLatency(ms: number) {
    this.latencies.push(ms);
    if (this.latencies.length > 2000) {
      this.latencies.shift();
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
    return sorted[idx];
  }

  getMetrics(): SystemMetrics {
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    const avg = this.latencies.length > 0 ? sum / this.latencies.length : 0;
    const last = this.latencies.length > 0 ? this.latencies[this.latencies.length - 1] : 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);

    return {
      transactionsByStatus: { ...this.transactionsByStatus },
      duplicatesDetected: this.duplicatesDetected,
      retriesTotal: this.retriesTotal,
      dlqMessagesTotal: this.dlqMessagesTotal,
      lockConflictsTotal: this.lockConflictsTotal,
      reconciliationDiscrepanciesTotal: this.reconciliationDiscrepanciesTotal,
      outboxLag: this.outboxLag,
      lastProcessingLatencyMs: Number(last.toFixed(2)),
      averageLatencyMs: Number(avg.toFixed(2)),
      p50LatencyMs: Number(this.percentile(sorted, 0.5).toFixed(2)),
      p95LatencyMs: Number(this.percentile(sorted, 0.95).toFixed(2)),
      p99LatencyMs: Number(this.percentile(sorted, 0.99).toFixed(2)),
    };
  }

  toPrometheus(): string {
    const m = this.getMetrics();
    const lines: string[] = [
      "# HELP wager_transactions_total Total wagering transactions by status",
      "# TYPE wager_transactions_total counter",
      ...Object.entries(m.transactionsByStatus).map(
        ([status, count]) => `wager_transactions_total{status="${status}"} ${count}`,
      ),
      "# HELP wager_duplicates_detected_total Total idempotent duplicate transactions detected",
      "# TYPE wager_duplicates_detected_total counter",
      `wager_duplicates_detected_total ${m.duplicatesDetected}`,
      "# HELP wager_retries_total Total retry attempts across SQS and Outbox",
      "# TYPE wager_retries_total counter",
      `wager_retries_total ${m.retriesTotal}`,
      "# HELP wager_dlq_messages_total Total messages routed to Dead Letter Queue",
      "# TYPE wager_dlq_messages_total counter",
      `wager_dlq_messages_total ${m.dlqMessagesTotal}`,
      "# HELP wager_lock_conflicts_total Total database lock and constraint conflicts",
      "# TYPE wager_lock_conflicts_total counter",
      `wager_lock_conflicts_total ${m.lockConflictsTotal}`,
      "# HELP wallet_reconciliation_discrepancies_total Total wallet reconciliation discrepancies detected",
      "# TYPE wallet_reconciliation_discrepancies_total counter",
      `wallet_reconciliation_discrepancies_total ${m.reconciliationDiscrepanciesTotal}`,
      "# HELP outbox_pending_messages Current number of unpublished messages in outbox",
      "# TYPE outbox_pending_messages gauge",
      `outbox_pending_messages ${m.outboxLag}`,
      "# HELP wager_processing_latency_ms Processing latency quantiles in milliseconds",
      "# TYPE wager_processing_latency_ms summary",
      `wager_processing_latency_ms{quantile="0.5"} ${m.p50LatencyMs}`,
      `wager_processing_latency_ms{quantile="0.95"} ${m.p95LatencyMs}`,
      `wager_processing_latency_ms{quantile="0.99"} ${m.p99LatencyMs}`,
      `wager_processing_latency_avg_ms ${m.averageLatencyMs}`,
    ];
    return lines.join("\n") + "\n";
  }
}

