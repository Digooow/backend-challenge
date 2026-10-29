import { DomainException } from "../../domain/exceptions/domain.exception";
import { Money, MoneyProps } from "../../domain/value-objects/money";
import { LedgerDirection } from "../../domain/enums/ledger-direction";
import { WalletRepositoryPort } from "../ports/wallet.repository";

export interface ReconcileWalletOutputDto {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

export class ReconcileWalletUseCase {
  constructor(private readonly walletRepo: WalletRepositoryPort) {}

  async execute(walletId: string): Promise<ReconcileWalletOutputDto> {
    const wallet = await this.walletRepo.findById(walletId);

    if (!wallet) {
      throw new DomainException(`Carteira ${walletId} não encontrada.`);
    }

    const entries = await this.walletRepo.getLedgerEntries(walletId);

    let calculated = Money.zero(wallet.currency);

    for (const entry of entries) {
      if (entry.direction === LedgerDirection.Credit) {
        calculated = calculated.add(entry.money);
      } else {
        calculated = calculated.subtract(entry.money);
      }
    }

    const difference = wallet.balance.subtract(calculated);
    const consistent = difference.isZero();

    return {
      walletId: wallet.id,
      storedBalance: wallet.balance.toJSON(),
      calculatedBalance: calculated.toJSON(),
      difference: difference.toJSON(),
      consistent,
      checkedEntries: entries.length,
    };
  }
}