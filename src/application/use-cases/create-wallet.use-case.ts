import { DomainException } from "../../domain/exceptions/domain.exception";
import { Wallet } from "../../domain/entities/wallet";
import { Money } from "../../domain/value-objects/money";
import { WalletRepositoryPort } from "../ports/wallet.repository";
import { WagerTransactionRepositoryPort } from "../ports/wager-transaction.repository";
import { UnitOfWorkPort } from "../ports/unit-of-work.port";
import { CreateWalletInputDto, CreateWalletOutputDto } from "../dtos/create-wallet.dto";

export class CreateWalletUseCase {
  constructor(
    private readonly walletRepo: WalletRepositoryPort,
    private readonly uow: UnitOfWorkPort,
    private readonly wagerTxRepo?: WagerTransactionRepositoryPort,
  ) {}

  async execute(input: CreateWalletInputDto): Promise<CreateWalletOutputDto> {
    if (!input?.playerId || typeof input.playerId !== "string" || !input.playerId.trim()) {
      throw DomainException.validation("O campo playerId é obrigatório.");
    }

    const initialMoney = Money.from(input.initialBalance);

    try {
      return await this.uow.transaction(async (tx) => {
        const existingWallet = await this.walletRepo.findByPlayerAndCurrency(
          input.playerId,
          initialMoney.currency,
          tx,
        );

        if (existingWallet) {
          throw DomainException.conflict(
            `Já existe uma carteira cadastrada para o jogador ${input.playerId} com a moeda ${initialMoney.currency}.`,
            "WALLET_ALREADY_EXISTS",
          );
        }

        const { wallet, openingLedgerEntry, openingTransaction } = Wallet.open({
          id: crypto.randomUUID(),
          playerId: input.playerId,
          initialBalance: initialMoney,
        });

        await this.walletRepo.save(wallet, tx);

        if (openingTransaction && this.wagerTxRepo) {
          await this.wagerTxRepo.save(openingTransaction, tx);
        }

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
    } catch (error: any) {
      if (
        error?.code === "23505" ||
        error?.name === "UniqueConstraintViolationException" ||
        (typeof error?.message === "string" && error.message.includes("unique_player_currency"))
      ) {
        throw DomainException.conflict(
          `Já existe uma carteira cadastrada para o jogador ${input.playerId} com a moeda ${initialMoney.currency}.`,
          "WALLET_ALREADY_EXISTS",
        );
      }
      throw error;
    }
  }
}
