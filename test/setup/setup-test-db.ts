import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../src/infrastructure/database/mikro-orm.config';

let orm: MikroORM;

export async function setupTestDb() {
  process.env.DB_PORT = '5434';
  process.env.DB_USER = 'jungle_user';
  process.env.DB_PASSWORD = 'jungle_password';
  process.env.DB_NAME = 'jungle_test_db';
  process.env.SQS_ENDPOINT = 'http://localhost:4567';

  // Mesmo cast usado no AppModule: o config é tipado com o driver genérico do core
  orm = (await MikroORM.init(config as any)) as unknown as MikroORM;
  
  try {
    // Tenta usar o método oficial do MikroORM v6
    await (orm.schema as any).refreshDatabase();
  } catch (error) {
    // Fallback à prova de balas usando SQL puro
    const connection = orm.em.getConnection();
    await connection.execute(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    
    // Extrai o SQL de criação das suas entidades e executa
    const schemaSql = await (orm.schema as any).getCreateSchemaSQL();
    if (schemaSql) {
      await connection.execute(schemaSql);
    } else {
      await (orm.schema as any).createSchema();
    }
  }

  // Garante a trigger de imutabilidade (Append-Only) do ledger também no banco de testes
  const connection = orm.em.getConnection();
  await connection.execute(`
    CREATE OR REPLACE FUNCTION forbid_ledger_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'wallet_ledger_entries is append-only: % is forbidden', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_forbid_ledger_mutation ON "wallet_ledger_entries";
    CREATE TRIGGER trigger_forbid_ledger_mutation
    BEFORE UPDATE OR DELETE ON "wallet_ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
  `);
  
  return orm;
}

export async function teardownTestDb() {
  if (orm) {
    await orm.close(true);
  }
}
