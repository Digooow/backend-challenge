import { DomainException } from "../../domain/exceptions/domain.exception";
import { Wallet } from "../../domain/entities/wallet";
import { Money } from "../../domain/value-objects/money";
import { WalletRepositoryPort } from "../ports/wallet.repository";
import { UnitOfWorkPort } from "../ports/unit-of-work.port";
import { CreateWalletInputDto, CreateWalletOutputDto } from "../dtos/create-wallet.dto";

export class CreateWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly uow: UnitOfWorkPort,
  ) {}

  async execute(input: CreateWalletInputDto): Promise<CreateWalletOutputDto> {
    const initialMoney = Money.from(input.initialBalance);

    return this.uow.transaction(async (tx) => {
      const existingWallet = await this.walletRepo.findByPlayerAndCurrency(
        input.playerId,
        initialMoney.currency,
        tx,
      );

      if (existingWallet) {
        throw new DomainException(
          `Já existe uma carteira cadastrada para o jogador ${input.playerId} com a moeda ${initialMoney.currency}.`,
        );
      }

      const { wallet, openingLedgerEntry } = Wallet.open({
        id: crypto.randomUUID(),
        playerId: input.playerId,
        initialBalance: initialMoney,
      });

      await this.walletRepo.save(wallet, tx);

      if (openingLedgerEntry) {
        await this.walletRepo.saveLedgerEntry(openingLedgerEntry, tx);
      }

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }
}