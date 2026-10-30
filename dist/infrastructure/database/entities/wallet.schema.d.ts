import { EntitySchema } from "@mikro-orm/core";
export interface WalletEntity {
    id: string;
    playerId: string;
    currency: string;
    balance: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const WalletSchema: EntitySchema<WalletEntity, never, import("@mikro-orm/core").EntityCtor<WalletEntity>>;
