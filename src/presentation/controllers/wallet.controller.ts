// src/presentation/controllers/wallet.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { WalletRepositoryPort } from "../../application/ports/wallet.repository";
import { CreateWalletUseCase } from "../../application/use-cases/create-wallet.use-case";
import { ReconcileWalletUseCase } from "../../application/use-cases/reconcile-wallet.use-case";
import { ProviderAuthGuard } from "../guards/provider-auth.guard";
import { DomainException } from "../../domain/exceptions/domain.exception";

@Controller("wallets")
@UseGuards(ProviderAuthGuard)
export class WalletController {
  constructor(
    @Inject('WalletRepositoryPort') private readonly walletRepo: WalletRepositoryPort,
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly reconcileUseCase: ReconcileWalletUseCase
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWallet(
    @Body() body: { playerId: string; initialBalance: { amount: string; currency: string } }
  ) {
    try {
      return await this.createWalletUseCase.execute({
        playerId: body.playerId,
        initialBalance: body.initialBalance,
      });
    } catch (error) {
      if (error instanceof DomainException && error.message.includes("Já existe")) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
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

  @Get(":walletId/ledger")
  async getWalletLedger(
    @Param("walletId") walletId: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string
  ) {
    const wallet = await this.walletRepo.findById(walletId);
    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const entries = await this.walletRepo.getLedgerEntries(walletId, parsedLimit, cursor);

    return {
      walletId,
      entries: entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: entries.length > 0 ? entries[entries.length - 1].createdAt.toISOString() : null,
    };
  }

  @Post(":walletId/reconciliation")
  @HttpCode(HttpStatus.OK)
  async reconcileWallet(@Param("walletId") walletId: string) {
    return this.reconcileUseCase.execute(walletId);
  }
}
