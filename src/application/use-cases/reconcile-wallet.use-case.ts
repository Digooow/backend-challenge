import { DomainException } from "../../domain/exceptions/domain.exception";
import { Money, MoneyProps } from "../../domain/value-objects/money";
import { LedgerDirection } from "../../domain/enums/ledger-direction";
import { WalletRepositoryPort } from "../ports/wallet.repository";
import { MetricsPort } from "../ports/metrics.port";

export interface ReconcileWalletOutputDto {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

export interface ReconciliationLoggerPort {
  error(message: Record<string, unknown> | string): void;
}

export class ReconcileWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly metricsService?: MetricsPort,
    private readonly logger?: ReconciliationLoggerPort,
  ) {}

  async execute(walletId: string): Promise<ReconcileWalletOutputDto> {
    const wallet = await this.walletRepo.findById(walletId);

    if (!wallet) {
      throw DomainException.notFound(`Carteira ${walletId} não encontrada.`, "WALLET_NOT_FOUND");
    }

    let calculated: Money;
    let checkedEntries: number;

    if (this.walletRepo.calculateLedgerSummary) {
      const summary = await this.walletRepo.calculateLedgerSummary(walletId, wallet.currency);
      calculated = summary.calculatedBalance;
      checkedEntries = summary.checkedEntries;
    } else {
      const entries = await this.walletRepo.getLedgerEntries(walletId, Number.MAX_SAFE_INTEGER);
      calculated = Money.zero(wallet.currency);

      for (const entry of entries) {
        if (entry.direction === LedgerDirection.Credit) {
          calculated = calculated.add(entry.money);
        } else {
          calculated = calculated.subtract(entry.money);
        }
      }
      checkedEntries = entries.length;
    }

    const difference = wallet.balance.subtract(calculated);
    const consistent = difference.isZero();

    if (!consistent) {
      this.metricsService?.incrementReconciliationDiscrepancy();
      const discrepancyPayload = {
        level: "ERROR",
        timestamp: new Date().toISOString(),
        context: ReconcileWalletUseCase.name,
        message: "Divergência detectada na reconciliação de carteira",
        walletId: wallet.id,
        storedBalance: wallet.balance.toString(),
        calculatedBalance: calculated.toString(),
        difference: difference.toString(),
        checkedEntries,
      };
      if (this.logger) {
        this.logger.error(discrepancyPayload);
      } else {
        process.stderr.write(`${JSON.stringify(discrepancyPayload)}\n`);
      }
    }

    return {
      walletId: wallet.id,
      storedBalance: wallet.balance.toJSON(),
      calculatedBalance: calculated.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries,
    };
  }
}
