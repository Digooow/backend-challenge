import { EntityManager } from "@mikro-orm/postgresql";
import { UnitOfWorkPort } from "../../application/ports/unit-of-work.port";
export declare class MikroOrmUnitOfWork implements UnitOfWorkPort {
    private readonly em;
    constructor(em: EntityManager);
    transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
}
