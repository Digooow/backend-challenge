import { WagerTransaction } from "../../domain/entities/wager-transaction";

export interface WagerTransactionRepositoryPort {
  findById(id: string, tx?: unknown): Promise<WagerTransaction | null>;
  findByIdempotencyKey(key: string, tx?: unknown): Promise<WagerTransaction | null>;
  findByProviderAndExternalId(providerId: string, externalTransactionId: string, tx?: unknown): Promise<WagerTransaction | null>;
  save(transaction: WagerTransaction, tx?: unknown): Promise<void>;
  findPendingReferences(limit: number, tx?: unknown): Promise<WagerTransaction[]>;
}