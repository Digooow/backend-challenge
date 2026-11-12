import { EntitySchema } from "@mikro-orm/core";
import { WagerTransactionKind } from "../../../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../../domain/enums/wager-transaction-status";
import { FailureCode } from "../../../domain/enums/failure-code";

export interface WagerTransactionEntity {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export const WagerTransactionSchema = new EntitySchema<WagerTransactionEntity>({
  name: "WagerTransaction",
  tableName: "wager_transactions",
  properties: {
    id: { type: "uuid", primary: true },
    providerId: { type: "string" },
    externalTransactionId: { type: "string" },
    idempotencyKey: { type: "string" },
    payloadHash: { type: "string" },
    walletId: { type: "uuid", index: true },
    playerId: { type: "string", index: true },
    roundId: { type: "string" },
    gameId: { type: "string" },
    kind: { type: "enum", enum: true, items: () => WagerTransactionKind },
    amount: { type: "decimal", precision: 19, scale: 2 },
    currency: { type: "string", length: 3 },
    referenceExternalTransactionId: { type: "string", nullable: true },
    createdAt: { type: "datetime" },
    status: { type: "enum", enum: true, items: () => WagerTransactionStatus },
    referenceTransactionId: { type: "uuid", nullable: true },
    failureCode: { type: "enum", enum: true, items: () => FailureCode, nullable: true },
    processedAt: { type: "datetime", nullable: true },
  },
  uniques: [
    { name: "unique_idempotency_key", properties: ["idempotencyKey"] },
    { name: "unique_provider_external_id", properties: ["providerId", "externalTransactionId"] },
  ],
  indexes: [
    { name: "wager_transactions_status_created_at_idx", properties: ["status", "createdAt"] },
    {
      name: "wager_transactions_provider_ref_ext_idx",
      properties: ["providerId", "referenceExternalTransactionId"],
    },
  ],
});