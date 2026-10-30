import { EntityManager } from "@mikro-orm/postgresql";
import { UnitOfWorkPort } from "../../application/ports/unit-of-work.port";

export class MikroOrmUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly em: EntityManager) {}

  async transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    // fork() garante um Identity Map novo e isolado para cada requisição concorrente
    return this.em.fork().transactional(async (forkedEm) => {
      return work(forkedEm);
    });
  }
}