import { Migration } from '@mikro-orm/migrations';

export class Migration20261029163215_InitSchema extends Migration {

  override name = 'Migration20261029163215_InitSchema';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("message_id" varchar(255) not null, "consumer_name" varchar(255) not null, "payload_hash" varchar(255) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, primary key ("message_id", "consumer_name"));`);

    this.addSql(`create table "outbox_messages" ("id" uuid not null, "aggregate_id" varchar(255) not null, "event_type" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null default 0, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_aggregate_id_index" on "outbox_messages" ("aggregate_id");`);
    this.addSql(`create index "outbox_messages_next_attempt_at_index" on "outbox_messages" ("next_attempt_at");`);
    this.addSql(`create index "outbox_messages_published_at_index" on "outbox_messages" ("published_at");`);
    this.addSql(`create index "outbox_messages_pending_relay_idx" on "outbox_messages" ("occurred_at", "next_attempt_at") where "published_at" is null;`);

    this.addSql(`create table "wallets" ("id" uuid not null, "player_id" varchar(255) not null, "currency" varchar(3) not null, "balance" numeric(19,2) not null, "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "wallets_player_id_index" on "wallets" ("player_id");`);
    this.addSql(`alter table "wallets" add constraint "unique_player_currency" unique ("player_id", "currency");`);
    this.addSql(`alter table "wallets" add constraint "check_non_negative_balance" check (balance >= 0);`);

    this.addSql(`create table "wager_transactions" ("id" uuid not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(255) not null, "wallet_id" uuid not null, "player_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" text not null, "amount" numeric(19,2) not null, "currency" varchar(3) not null, "reference_external_transaction_id" varchar(255) null, "created_at" timestamptz not null, "status" text not null, "reference_transaction_id" uuid null, "failure_code" text null, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "wager_transactions_wallet_id_index" on "wager_transactions" ("wallet_id");`);
    this.addSql(`create index "wager_transactions_player_id_index" on "wager_transactions" ("player_id");`);
    this.addSql(`create index "wager_transactions_status_created_at_idx" on "wager_transactions" ("status", "created_at");`);
    this.addSql(`create index "wager_transactions_provider_ref_ext_idx" on "wager_transactions" ("provider_id", "reference_external_transaction_id");`);
    this.addSql(`alter table "wager_transactions" add constraint "fk_wager_transactions_wallet" foreign key ("wallet_id") references "wallets" ("id") on delete restrict;`);
    this.addSql(`alter table "wager_transactions" add constraint "unique_idempotency_key" unique ("idempotency_key");`);
    this.addSql(`alter table "wager_transactions" add constraint "unique_provider_external_id" unique ("provider_id", "external_transaction_id");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_failure_code_check" check ("failure_code" in ('INSUFFICIENT_BALANCE', 'INVALID_CURRENCY', 'REFERENCE_NOT_FOUND', 'INVALID_REFERENCE_KIND', 'REFERENCE_ALREADY_REVERTED', 'INVALID_AMOUNT', 'PAYLOAD_MISMATCH', 'DUPLICATE_TRANSACTION', 'INTERNAL_ERROR', 'NEGATIVE_BALANCE_PRODUCED'));`);

    this.addSql(`create table "wallet_ledger_entries" ("id" uuid not null, "wallet_id" uuid not null, "transaction_id" uuid not null, "direction" text not null, "amount" numeric(19,2) not null, "currency" varchar(3) not null, "balance_before" numeric(19,2) not null, "balance_after" numeric(19,2) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "wallet_ledger_entries_wallet_id_index" on "wallet_ledger_entries" ("wallet_id");`);
    this.addSql(`create index "wallet_ledger_entries_transaction_id_index" on "wallet_ledger_entries" ("transaction_id");`);
    this.addSql(`create index "wallet_ledger_entries_cursor_idx" on "wallet_ledger_entries" ("wallet_id", "created_at", "id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "fk_wallet_ledger_entries_wallet" foreign key ("wallet_id") references "wallets" ("id") on delete restrict;`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "unique_wallet_transaction_ledger" unique ("wallet_id", "transaction_id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "check_positive_ledger_amount" check (amount > 0);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "check_ledger_balance_arithmetic" check ((direction = 'CREDIT' and balance_before + amount = balance_after) or (direction = 'DEBIT' and balance_before - amount = balance_after));`);

    // Trigger de imutabilidade física (Append-Only) para wallet_ledger_entries (Seção 5 Regra 5 e 9)
    this.addSql(`
      create or replace function forbid_ledger_mutation()
      returns trigger as $$
      begin
        raise exception 'wallet_ledger_entries is append-only: % is forbidden', tg_op;
      end;
      $$ language plpgsql;
    `);
    this.addSql(`
      create trigger trigger_forbid_ledger_mutation
      before update or delete on "wallet_ledger_entries"
      for each row execute function forbid_ledger_mutation();
    `);
  }

  async down(): Promise<void> {
    this.addSql(`drop trigger if exists "trigger_forbid_ledger_mutation" on "wallet_ledger_entries";`);
    this.addSql(`drop function if exists forbid_ledger_mutation();`);
    this.addSql(`drop table if exists "outbox_messages" cascade;`);
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop table if exists "wallets" cascade;`);
  }
}
