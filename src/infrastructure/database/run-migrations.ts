import { MikroORM } from "@mikro-orm/core";
import config from "./mikro-orm.config";

/**
 * Script de gerenciamento de migrações.
 *
 * Uso recomendado (npm scripts):
 *   - `npm run migration:sync` – sincroniza o schema a partir das entidades (dev);
 *   - `npm run migration:up`    – aplica migrations versionadas (produção);
 *   - `npm run migration:down`  – reverte migrations (produção);
 *   - `npm run migration:create -- -n <nome>` – cria nova migration via CLI.
 */
async function run() {
  // A configuração já inclui o `Migrator` em `extensions` (ver mikro-orm.config.ts).
  const orm = await MikroORM.init(config as any); // cast to any to avoid generic mismatch
  const action = process.argv[2] ?? "up";

  switch (action) {
    case "sync": {
      // Atualiza o schema a partir das entidades sem gerar arquivo de migração.
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