import { EntityManager, LockMode } from "@mikro-orm/postgresql";
import { Wallet } from "../../../domain/entities/wallet";
import { WalletLedgerEntry } from "../../../domain/entities/wallet-ledger-entry";
import { Money } from "../../../domain/value-objects/money";
import { DomainException } from "../../../domain/exceptions/domain.exception";
import { WalletRepositoryPort, LedgerSummaryResult } from "../../../application/ports/wallet.repository";
import { WalletSchema, WalletEntity } from "../entities/wallet.schema";
import {
  WalletLedgerEntrySchema,
  WalletLedgerEntryEntity,
} from "../entities/wallet-ledger-entry.schema";

export class MikroOrmWalletRepository implements WalletRepositoryPort {
  constructor(private readonly globalEm: EntityManager) {}

  public static encodeLedgerCursor(entry: { createdAt: Date; id: string }): string {
    const raw = JSON.stringify({ t: entry.createdAt.toISOString(), id: entry.id });
    return Buffer.from(raw, "utf-8").toString("base64url");
  }

  public static decodeLedgerCursor(cursor: string): { createdAt: Date; id?: string } {
    try {
      const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
      if (decoded.startsWith("{")) {
        const parsed = JSON.parse(decoded);
        const date = new Date(parsed.t);
        if (isNaN(date.getTime()) || typeof parsed.id !== "string") {
          throw new Error("Invalid opaque cursor");
        }
        return { createdAt: date, id: parsed.id };
      }
    } catch {
      // Fallback para cursor ISO bruto se fornecido
    }

    const fallbackDate = new Date(cursor);
    if (isNaN(fallbackDate.getTime())) {
      throw DomainException.validation("Cursor de paginação inválido.");
    }
    return { createdAt: fallbackDate };
  }

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

  async findLedgerEntryByTransactionId(
    walletId: string,
    transactionId: string,
    tx?: unknown,
  ): Promise<WalletLedgerEntry | null> {
    const em = this.getEm(tx);
    const entity = await em.findOne(WalletLedgerEntrySchema, {
      walletId,
      transactionId,
    });
    if (!entity) return null;

    return WalletLedgerEntry.rehydrate({
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
    });
  }

  async calculateLedgerSummary(
    walletId: string,
    currency: string,
    tx?: unknown,
  ): Promise<LedgerSummaryResult> {
    const em = this.getEm(tx);
    const rows = await em.getConnection().execute<
      Array<{ checked_entries: number | string; total: string }>
    >(
      `SELECT COUNT(*)::int AS checked_entries,
              COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::numeric(19,2)::text AS total
       FROM "wallet_ledger_entries"
       WHERE "wallet_id" = ?`,
      [walletId],
    );

    const row = rows[0] ?? { checked_entries: 0, total: "0.00" };
    const checkedEntries = Number(row.checked_entries);
    const totalStr = String(row.total);

    let calculatedBalance: Money;
    if (totalStr.startsWith("-")) {
      const absAmount = totalStr.slice(1);
      calculatedBalance = Money.zero(currency).subtract(
        Money.from({ amount: absAmount, currency }),
      );
    } else {
      calculatedBalance = Money.from({ amount: totalStr, currency });
    }

    return {
      calculatedBalance,
      checkedEntries,
    };
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
      const decoded = MikroOrmWalletRepository.decodeLedgerCursor(cursor);
      if (decoded.id) {
        filter.$or = [
          { createdAt: { $gt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { $gt: decoded.id } },
        ];
      } else {
        filter.createdAt = { $gt: decoded.createdAt };
      }
    }

    const entities = await em.find(WalletLedgerEntrySchema, filter, {
      orderBy: { createdAt: "ASC", id: "ASC" },
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