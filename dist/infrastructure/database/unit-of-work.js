"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MikroOrmUnitOfWork = void 0;
class MikroOrmUnitOfWork {
    constructor(em) {
        this.em = em;
    }
    async transaction(work) {
        return this.em.fork().transactional(async (forkedEm) => {
            return work(forkedEm);
        });
    }
}
exports.MikroOrmUnitOfWork = MikroOrmUnitOfWork;
//# sourceMappingURL=unit-of-work.js.map