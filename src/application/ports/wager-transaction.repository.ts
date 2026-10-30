import { WagerTransaction } from "../../domain/entities/wager-transaction";
import { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";

export interface WagerTransactionRepositoryPort {
  findById(id: string, tx?: unknown): Promise<WagerTransaction | null>;
  findByIdempotencyKey(key: string, tx?: unknown): Promise<WagerTransaction | null>;
  findByProviderAndExternalId(providerId: string, externalTransactionId: string, tx?: unknown): Promise<WagerTransaction | null>;
  findReversals(
    providerId: string,
    referenceExternalTransactionId: string,
    kind: WagerTransactionKind,
    tx?: unknown
  ): Promise<WagerTransaction[]>;
  save(transaction: WagerTransaction, tx?: unknown): Promise<void>;
  findPendingReferences(limit: number, tx?: unknown): Promise<WagerTransaction[]>;
}
