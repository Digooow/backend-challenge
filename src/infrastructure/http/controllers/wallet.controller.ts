import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, NotFoundException, ConflictException } from '@nestjs/common';
import { MikroOrmWalletRepository } from '../../database/repositories/mikro-orm-wallet.repository';
import { MikroOrmUnitOfWork } from '../../database/unit-of-work';
import { Wallet } from '../../../domain/entities/wallet';
import { Money } from '../../../domain/value-objects/money';

@Controller('wallets')
export class WalletController {
  constructor(
    private readonly walletRepo: MikroOrmWalletRepository,
    private readonly uow: MikroOrmUnitOfWork,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWallet(@Body() body: { playerId: string; initialBalance: { amount: string; currency: string } }) {
    return this.uow.transaction(async (tx) => {
      // Verifica se já existe para evitar erro 500 de constraint
      const existing = await this.walletRepo.findByPlayerAndCurrency(body.playerId, body.initialBalance.currency, tx);
      if (existing) {
        throw new ConflictException(`Wallet for player ${body.playerId} and currency ${body.initialBalance.currency} already exists.`);
      }

      const { wallet, openingLedgerEntry } = Wallet.open({
        id: crypto.randomUUID(),
        playerId: body.playerId,
        initialBalance: Money.from(body.initialBalance),
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

  @Get(':walletId')
  async getWallet(@Param('walletId') walletId: string) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) throw new NotFoundException('Wallet not found');

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }
}