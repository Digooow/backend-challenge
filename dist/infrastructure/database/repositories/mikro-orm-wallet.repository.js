"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmWalletRepository = void 0;
const postgresql_1 = require("@mikro-orm/postgresql");
const wallet_1 = require("../../../domain/entities/wallet");
const wallet_ledger_entry_1 = require("../../../domain/entities/wallet-ledger-entry");
const money_1 = require("../../../domain/value-objects/money");
const wallet_schema_1 = require("../entities/wallet.schema");
const wallet_ledger_entry_schema_1 = require("../entities/wallet-ledger-entry.schema");
class MikroOrmWalletRepository {
    constructor(globalEm) {
        this.globalEm = globalEm;
    }
    getEm(tx) {
        return tx ?? this.globalEm;
    }
    async findById(id, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(wallet_schema_1.WalletSchema, { id });
        if (!entity)
            return null;
        return wallet_1.Wallet.rehydrate({
            id: entity.id,
            playerId: entity.playerId,
            currency: entity.currency,
            balance: money_1.Money.from({ amount: entity.balance, currency: entity.currency }),
            version: entity.version,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        });
    }
    async findByIdForUpdate(id, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(wallet_schema_1.WalletSchema, { id }, { lockMode: postgresql_1.LockMode.PESSIMISTIC_WRITE });
        if (!entity)
            return null;
        return wallet_1.Wallet.rehydrate({
            id: entity.id,
            playerId: entity.playerId,
            currency: entity.currency,
            balance: money_1.Money.from({ amount: entity.balance, currency: entity.currency }),
            version: entity.version,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        });
    }
    async findByPlayerAndCurrency(playerId, currency, tx) {
        const em = this.getEm(tx);
        const entity = await em.findOne(wallet_schema_1.WalletSchema, { playerId, currency });
        if (!entity)
            return null;
        return wallet_1.Wallet.rehydrate({
            id: entity.id,
            playerId: entity.playerId,
            currency: entity.currency,
            balance: money_1.Money.from({ amount: entity.balance, currency: entity.currency }),
            version: entity.version,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        });
    }
    async save(wallet, tx) {
        const em = this.getEm(tx);
        const existing = await em.findOne(wallet_schema_1.WalletSchema, { id: wallet.id });
        if (existing) {
            existing.balance = wallet.balance.toString();
            existing.version = wallet.version;
            existing.updatedAt = wallet.updatedAt;
        }
        else {
            const entity = {
                id: wallet.id,
                playerId: wallet.playerId,
                currency: wallet.currency,
                balance: wallet.balance.toString(),
                version: wallet.version,
                createdAt: wallet.createdAt,
                updatedAt: wallet.updatedAt,
            };
            em.persist(em.create(wallet_schema_1.WalletSchema, entity));
        }
    }
    async saveLedgerEntry(entry, tx) {
        const em = this.getEm(tx);
        const entity = {
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
        em.persist(em.create(wallet_ledger_entry_schema_1.WalletLedgerEntrySchema, entity));
    }
    async getLedgerEntries(walletId, limit = 100, cursor, tx) {
        const em = this.getEm(tx);
        const filter = { walletId };
        if (cursor) {
            filter.createdAt = { $gt: new Date(cursor) };
        }
        const entities = await em.find(wallet_ledger_entry_schema_1.WalletLedgerEntrySchema, filter, {
            orderBy: { createdAt: "ASC" },
            limit,
        });
        return entities.map((entity) => wallet_ledger_entry_1.WalletLedgerEntry.rehydrate({
            id: entity.id,
            walletId: entity.walletId,
            transactionId: entity.transactionId,
            direction: entity.direction,
            money: money_1.Money.from({ amount: entity.amount, currency: entity.currency }),
            balanceBefore: money_1.Money.from({
                amount: entity.balanceBefore,
                currency: entity.currency,
            }),
            balanceAfter: money_1.Money.from({
                amount: entity.balanceAfter,
                currency: entity.currency,
            }),
            createdAt: entity.createdAt,
        }));
    }
}
exports.MikroOrmWalletRepository = MikroOrmWalletRepository;
//# sourceMappingURL=mikro-orm-wallet.repository.js.map