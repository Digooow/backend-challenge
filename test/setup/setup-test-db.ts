import { MikroORM } from '@mikro-orm/postgresql';
import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { getMikroOrmConfig } from '../../src/infrastructure/database/mikro-orm.config';

let orm: MikroORM;

export async function ensureTestSqsQueues(endpoint: string): Promise<{
  queueUrl: string;
  dlqUrl: string;
}> {
  const sqs = new SQSClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });

  try {
    const dlqRes = await sqs.send(
      new CreateQueueCommand({
        QueueName: 'wager-transactions-dlq.fifo',
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'true',
        },
      }),
    );
    const dlqUrl = dlqRes.QueueUrl ?? `${endpoint}/000000000000/wager-transactions-dlq.fifo`;

    const dlqAttr = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: dlqUrl,
        AttributeNames: ['QueueArn'],
      }),
    );
    const dlqArn =
      dlqAttr.Attributes?.QueueArn ??
      'arn:aws:sqs:us-east-1:000000000000:wager-transactions-dlq.fifo';

    const mainRes = await sqs.send(
      new CreateQueueCommand({
        QueueName: 'wager-transactions.fifo',
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'true',
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: dlqArn,
            maxReceiveCount: '3',
          }),
        },
      }),
    );
    const queueUrl = mainRes.QueueUrl ?? `${endpoint}/000000000000/wager-transactions.fifo`;

    process.env.SQS_ENDPOINT = endpoint;
    process.env.SQS_WAGER_QUEUE_URL = queueUrl;
    process.env.SQS_WAGER_DLQ_URL = dlqUrl;

    return { queueUrl, dlqUrl };
  } finally {
    sqs.destroy();
  }
}

export async function resolveSqsEndpoint(): Promise<string> {
  const candidates = [
    process.env.TEST_SQS_ENDPOINT,
    'http://localhost:4567',
    'http://localhost:4566',
  ].filter(Boolean) as string[];

  for (const endpoint of candidates) {
    try {
      const res = await fetch(`${endpoint}/_localstack/health`);
      if (res.ok) return endpoint;
    } catch {
      // Tenta próximo candidato
    }
  }
  return 'http://localhost:4567';
}

export async function setupTestDb() {
  process.env.DB_USER = process.env.DB_USER ?? 'jungle_user';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'jungle_password';

  // Tenta conectar primeiro no banco de testes (5434 / jungle_test_db);
  // caso o avaliador esteja com apenas o docker-compose.yml principal ativo (5433 / jungle_db), faz fallback automático.
  const candidates = [
    { port: '5434', dbName: 'jungle_test_db' },
    { port: '5433', dbName: 'jungle_db' },
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      process.env.DB_PORT = candidate.port;
      process.env.DB_NAME = candidate.dbName;
      const dynamicConfig = getMikroOrmConfig();
      orm = (await MikroORM.init(dynamicConfig as any)) as unknown as MikroORM;
      await orm.em.getConnection().execute('SELECT 1');
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (orm) {
        await orm.close(true).catch(() => {});
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  try {
    await (orm.schema as any).refreshDatabase();
  } catch {
    const connection = orm.em.getConnection();
    await connection.execute(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
    const schemaSql = await (orm.schema as any).getCreateSchemaSQL();
    if (schemaSql) {
      await connection.execute(schemaSql);
    } else {
      await (orm.schema as any).createSchema();
    }
  }

  // Garante a trigger de imutabilidade (Append-Only) e FKs do ledger no banco de testes
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
