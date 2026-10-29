# Architecture Documentation

## Overview
This document describes the architectural decisions that satisfy the **eliminatory requirements** of the Jungle Gaming technical challenge. It is kept separate from the challenge README so that the README remains the public description of the problem.

## 1. Persistence & ORM
- **ORM**: **MikroORM 7.x** (`@mikro-orm/*` packages) – provides Unit‑of‑Work, identity map and explicit transaction support.
- **Database**: PostgreSQL.
- **Money handling**: All monetary values are stored as `NUMERIC(20,2)` and manipulated in the domain using `big.js` (`big.js` wrapper `Money` class). No `number`, `float` or `double` is used.
- **Constraints** (enforced at the DB level):
  - `CHECK (balance >= 0)` on the `wallet` table.
  - `UNIQUE (player_id, currency)` to guarantee one wallet per player/currency.
  - Foreign‑key constraints for ledger entries, inbox/outbox, and wager transactions.
- **Optimistic locking**: `version` column on `wallet` (incremented only when the balance changes). Updates are performed with `entityManager.lock(wallet, LockMode.OPTIMISTIC, version)`.

## 2. Migrations Strategy
- **Versioned migrations** are required (challenge §5). They are created **exclusively via the CLI** (`npm run migration:create`) which guarantees the correct file layout and naming.
- **Programmatic migration creation** (`orm.migrator.createMigration()`) is kept only for the optional `create` action of the helper script, but production environments should rely on the CLI.
- **Dev workflow**: `npm run migration:sync` runs a **schema‑synchronisation** step (`SchemaGenerator.updateSchema()`). This updates the DB directly from the entity definitions without generating a migration file, avoiding the looping error you encountered.
- **Production workflow**: `npm run migration:up` and `npm run migration:down` apply/revert versioned migrations. Because migrations are idempotent, multiple service instances can run them safely.

## 3. Idempotency & Concurrency
- **InboxMessage** stores the `idempotencyKey` and a `processedAt` timestamp. Before processing an event the service checks that the message is not already marked as processed.
- **Transactional boundary**: All changes to `wallet`, `wallet_ledger_entry`, `inbox_message` and `outbox_message` happen inside a single SQL transaction (`entityManager.transactional`). No event is published to SQS before the transaction commits (requirement 4).
- **Optimistic locking** prevents lost updates when several instances debit/credit the same wallet concurrently (requirement 8).
- **No in‑memory cache** is used for idempotency (requirement 2).

## 4. Messaging
- **AWS SQS (LocalStack)** is used for external communication. The internal processing pipeline treats SQS messages as *at‑least‑once*; missing references generate a `PENDING_REFERENCE` status and are re‑processed by a scheduled worker (challenge §7.1).
- **Outbox pattern**: `OutboxMessage` is persisted within the same transaction as the domain changes and a separate background worker reads the outbox and publishes to SQS, guaranteeing exactly‑once delivery from the perspective of the service.

## 5. Domain Model Highlights
- **Money** – immutable value object (`big.js` based). Stored as two columns (`amount NUMERIC`, `currency VARCHAR`).
- **Wallet** – aggregate root with strict invariants: single wallet per player/currency, never negative balance, versioned for optimistic locking.
- **WalletLedgerEntry** – immutable, creates a record for every balance‑affecting transaction. Enforced `CHECK (balance_before + amount = balance_after)` in the DB.
- **WagerTransaction** – state machine with explicit terminal states (`PROCESSED`, `REJECTED`, `FAILED`). Idempotency key ensures duplicate messages are ignored.

## 6. Scripts
| Script | Description |
|--------|-------------|
| `npm run migration:sync` | Syncs schema directly from entities – used in local development. |
| `npm run migration:up` | Applies all pending versioned migrations. |
| `npm run migration:down` | Rolls back the last migration batch. |
| `npm run migration:create -- -n <name>` | Generates a new migration file via CLI (the only approved way for production). |

The helper script `src/infrastructure/database/run-migrations.ts` implements these actions. It uses the correct `orm.migrator` property (MikroORM 7) and falls back to `SchemaGenerator` for the `sync` command.

## 7. How the current error was solved
- The original code called `orm.getMigrator()` which does **not exist** in MikroORM 7, causing the compile‑time error.
- The script was rewritten to use `orm.migrator` and to expose a **`sync`** command that avoids generating migrations programmatically.
- Documentation of this approach was moved to **ARCHITECTURE.md** so the public README stays focused on the challenge description.

---
*This file is intended for internal reviewers and for future contributors to understand the decisions that keep the solution compliant with all eliminatory constraints.*

