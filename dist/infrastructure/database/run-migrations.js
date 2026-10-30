"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@mikro-orm/core");
const mikro_orm_config_1 = require("./mikro-orm.config");
async function run() {
    const orm = await core_1.MikroORM.init(mikro_orm_config_1.default);
    const action = process.argv[2] ?? "up";
    switch (action) {
        case "sync": {
            const generator = orm.schema;
            await generator.ensureDatabase();
            await generator.update();
            console.log("✅ Esquema sincronizado com sucesso!");
            break;
        }
        case "up":
            await orm.migrator.up();
            console.log("✅ Migrations aplicadas com sucesso!");
            break;
        case "down":
            await orm.migrator.down();
            console.log("✅ Rollback realizado!");
            break;
        default:
            console.error(`⚠️ Ação desconhecida: ${action}`);
            process.exit(1);
    }
    await orm.close(true);
}
run().catch(err => {
    console.error("❌ Erro ao executar migrations:", err);
    process.exit(1);
});
//# sourceMappingURL=run-migrations.js.map