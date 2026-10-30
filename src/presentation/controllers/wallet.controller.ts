// src/presentation/controllers/wallet.controller.ts
import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus, NotFoundException, Inject } from "@nestjs/common";
import { WalletRepositoryPort } from "../../application/ports/wallet.repository";
import { ReconcileWalletUseCase } from "../../application/use-cases/reconcile-wallet.use-case";
import { Wallet } from "../../domain/entities/wallet";
import { Money } from "../../domain/value-objects/money";
import { EntityManager } from "@mikro-orm/postgresql";

@Controller("wallets")
export class WalletController {
  constructor(
    @Inject('WalletRepositoryPort') private readonly walletRepo: WalletRepositoryPort,
    private readonly reconcileUseCase: ReconcileWalletUseCase,
    private readonly em: EntityManager
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWallet(@Body() body: { playerId: string; initialBalance: { amount: string; currency: string } }) {
    const initialBalance = Money.from(body.initialBalance);
    const { wallet, openingLedgerEntry } = Wallet.open({
      id: crypto.randomUUID(),
      playerId: body.playerId,
      initialBalance,
    });

    await this.em.transactional(async (tx) => {
      await this.walletRepo.save(wallet, tx);
      if (openingLedgerEntry) {
        await this.walletRepo.saveLedgerEntry(openingLedgerEntry, tx);
      }
    });

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }

  @Get(":walletId")
  async getWallet(@Param("walletId") walletId: string) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }

  @Post(":walletId/reconciliation")
  @HttpCode(HttpStatus.OK)
  async reconcileWallet(@Param("walletId") walletId: string) {
    return this.reconcileUseCase.execute(walletId);
  }
}