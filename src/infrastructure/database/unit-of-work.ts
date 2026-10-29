import { EntityManager } from "@mikro-orm/postgresql";
import { UnitOfWorkPort } from "../../application/ports/unit-of-work.port";

export class MikroOrmUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly em: EntityManager) {}

  async transaction<T>(work: (txManager: EntityManager) => Promise<T>): Promise<T> {
    return this.em.transactional((forkedEm) => work(forkedEm));
  }
}