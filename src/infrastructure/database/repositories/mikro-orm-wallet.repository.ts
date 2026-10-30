import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { Wallet } from "../../../domain/entities/wallet";
import { WalletLedgerEntry } from "../../../domain/entities/wallet-ledger-entry";
import { Money } from "../../../domain/value-objects/money";
import { WalletRepositoryPort } from "../../../application/ports/wallet.repository";
import { WalletSchema, WalletEntity } from "../entities/wallet.schema";
import {
  WalletLedgerEntrySchema,
  WalletLedgerEntryEntity,
} from "../entities/wallet-ledger-entry.schema";

export class MikroOrmWalletRepository implements WalletRepositoryPort {
  constructor(private readonly globalEm: EntityManager) {}

  private getEm(tx?: unknown): EntityManager {
    return (tx as EntityManager) ?? this.globalEm;
  }

  async findById(id: string, tx?: unknown): Promise<Wallet | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(WalletSchema, { id });
    if (!entity) return null;

    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({ amount: entity.balance, currency: entity.currency }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  async findByIdForUpdate(id: string, tx?: unknown): Promise<Wallet | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(
      WalletSchema,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!entity) return null;

    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({ amount: entity.balance, currency: entity.currency }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  async findByPlayerAndCurrency(
    playerId: string,
    currency: string,
    tx?: unknown,
  ): Promise<Wallet | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(WalletSchema, { playerId, currency });
    if (!entity) return null;

    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({ amount: entity.balance, currency: entity.currency }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  async save(wallet: Wallet, tx?: unknown): Promise<void> {
    const em = this.getEm(tx);
    const existing = await em.findOne(WalletSchema, { id: wallet.id });

    if (existing) {
      existing.balance = wallet.balance.toString();
      existing.version = wallet.version;
      existing.updatedAt = wallet.updatedAt;
    } else {
      const entity: WalletEntity = {
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: wallet.balance.toString(),
        version: wallet.version,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      };
      em.persist(em.create(WalletSchema, entity));
    }
  }

  async saveLedgerEntry(entry: WalletLedgerEntry, tx?: unknown): Promise<void> {
    const em = this.getEm(tx);
    const entity: WalletLedgerEntryEntity = {
      id: entry.id,
      walletId: entry.walletId,
      transactionId: entry.transactionId,
      direction: entry.direction,
      amount: entry.money.toString(),
      currency: entry.money.currency,
      balanceBefore: entry.balanceBefore.toString(),
      balanceAfter: entry.balanceAfter.toString(),
      createdAt: entry.createdAt,
    };
    em.persist(em.create(WalletLedgerEntrySchema, entity));
  }

  async getLedgerEntries(
    walletId: string,
    limit: number = 100,
    cursor?: string,
    tx?: unknown,
  ): Promise<WalletLedgerEntry[]> {
    const em = this.getEm(tx);
    const filter: Record<string, unknown> = { walletId };

    if (cursor) {
      filter.createdAt = { $gt: new Date(cursor) };
    }

    const entities = await em.find(WalletLedgerEntrySchema, filter, {
      orderBy: { createdAt: "ASC" },
      limit,
    });

    return entities.map((entity) =>
      WalletLedgerEntry.rehydrate({
        id: entity.id,
        walletId: entity.walletId,
        transactionId: entity.transactionId,
        direction: entity.direction,
        money: Money.from({ amount: entity.amount, currency: entity.currency }),
        balanceBefore: Money.from({
          amount: entity.balanceBefore,
          currency: entity.currency,
        }),
        balanceAfter: Money.from({
          amount: entity.balanceAfter,
          currency: entity.currency,
        }),
        createdAt: entity.createdAt,
      }),
    );
  }
}