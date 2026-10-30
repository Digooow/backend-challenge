import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../src/infrastructure/database/mikro-orm.config';

let orm: MikroORM;

export async function setupTestDb() {
  process.env.DB_PORT = '5434';
  process.env.DB_USER = 'jungle_user';
  process.env.DB_PASSWORD = 'jungle_password';
  process.env.DB_NAME = 'jungle_test_db';
  process.env.SQS_ENDPOINT = 'http://localhost:4567';

  orm = await MikroORM.init(config);
  
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
  
  return orm;
}

export async function teardownTestDb() {
  if (orm) {
    await orm.close(true);
  }
}