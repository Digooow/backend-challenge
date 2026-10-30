import { EntityManager } from "@mikro-orm/postgresql";
import { WagerTransaction } from "../../../domain/entities/wager-transaction";
import { WagerTransactionRepositoryPort } from "../../../application/ports/wager-transaction.repository";
export declare class MikroOrmWagerTransactionRepository implements WagerTransactionRepositoryPort {
    private readonly globalEm;
    constructor(globalEm: EntityManager);
    private getEm;
    findById(id: string, tx?: unknown): Promise<WagerTransaction | null>;
    findByIdempotencyKey(key: string, tx?: unknown): Promise<WagerTransaction | null>;
    findByProviderAndExternalId(providerId: string, externalTransactionId: string, tx?: unknown): Promise<WagerTransaction | null>;
    save(transaction: WagerTransaction, tx?: unknown): Promise<void>;
    findPendingReferences(limit: number, tx?: unknown): Promise<WagerTransaction[]>;
    private toDomain;
}
