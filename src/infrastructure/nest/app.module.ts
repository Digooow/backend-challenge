import { EntityManager } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ScheduleModule } from '@nestjs/schedule';
import config from '../database/mikro-orm.config';
import { PendingReferenceWorker } from '../jobs/pending-reference.worker';
import { MikroOrmInboxRepository } from '../database/repositories/mikro-orm-inbox.repository';

// Controllers
import { HealthController } from '../../presentation/controllers/health.controller';
import { WalletController } from '../../presentation/controllers/wallet.controller';
import { WagerController } from '../../presentation/controllers/wager.controller';

// Repositories & UoW
import { MikroOrmWalletRepository } from '../database/repositories/mikro-orm-wallet.repository';
import { MikroOrmWagerTransactionRepository } from '../database/repositories/mikro-orm-wager-transaction.repository';
import { MikroOrmOutboxRepository } from '../database/repositories/mikro-orm-outbox.repository';
import { MikroOrmUnitOfWork } from '../database/unit-of-work';

// Use Cases
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case';

// Messaging
import { LocalstackSqsClient } from '../messaging/sqs/localstack-sqs.client';
import { OutboxPublisher } from '../messaging/outbox/outbox.publisher';
import { OutboxRelayWorker } from '../jobs/outbox-relay.worker';
import { WagerSqsConsumer } from '../messaging/sqs/wager-sqs.consumer';

// Observability
import { JsonLoggerService } from '../observability/json-logger.service';

@Module({
  imports: [
    MikroOrmModule.forRoot(config as any), // Uses mikro-orm.config.ts automatically
    ScheduleModule.forRoot(), // Enables Cron Jobs
  ],
  controllers: [HealthController, WalletController, WagerController],
  providers: [
    JsonLoggerService, // Registo do logger estruturado em JSON
    { provide: 'WalletRepositoryPort', useFactory: (em) => new MikroOrmWalletRepository(em), inject: [EntityManager] },
    { provide: 'WagerTransactionRepositoryPort', useFactory: (em) => new MikroOrmWagerTransactionRepository(em), inject: [EntityManager] },
    { provide: 'OutboxRepositoryPort', useFactory: (em) => new MikroOrmOutboxRepository(em), inject: [EntityManager] },
    { provide: 'UnitOfWorkPort', useFactory: (em) => new MikroOrmUnitOfWork(em), inject: [EntityManager] },
    { provide: 'MessagePublisherPort', useClass: LocalstackSqsClient },
    {
      provide: PendingReferenceWorker,
      useFactory: (wagerTxRepo, useCase, uow) => new PendingReferenceWorker(wagerTxRepo, useCase, uow),
      inject: ['WagerTransactionRepositoryPort', ProcessWagerTransactionUseCase, 'UnitOfWorkPort'],
    },
    { provide: 'InboxRepositoryPort', useFactory: (em) => new MikroOrmInboxRepository(em), inject: [EntityManager] },

    // Domain Use Cases
    {
      provide: ProcessWagerTransactionUseCase,
      useFactory: (walletRepo, wagerTxRepo, outboxRepo, uow) =>
        new ProcessWagerTransactionUseCase(walletRepo, wagerTxRepo, outboxRepo, uow),
      inject: ['WalletRepositoryPort', 'WagerTransactionRepositoryPort', 'OutboxRepositoryPort', 'UnitOfWorkPort'],
    },
    {
      provide: ReconcileWalletUseCase,
      useFactory: (walletRepo) => new ReconcileWalletUseCase(walletRepo),
      inject: ['WalletRepositoryPort'],
    },

    // Background Workers
    {
      provide: OutboxPublisher,
      useFactory: (outboxRepo, publisher, uow) =>
        new OutboxPublisher(outboxRepo, publisher, uow, process.env.SQS_WAGER_QUEUE_URL || 'http://localhost:4566/000000000000/wager-transactions.fifo'),
      inject: ['OutboxRepositoryPort', 'MessagePublisherPort', 'UnitOfWorkPort'],
    },
    OutboxRelayWorker,
    {
      provide: WagerSqsConsumer,
      useFactory: (useCase, inboxRepo, uow) => new WagerSqsConsumer(useCase, inboxRepo, uow),
      inject: [ProcessWagerTransactionUseCase, 'InboxRepositoryPort', 'UnitOfWorkPort'],
    }
  ],
  exports: [JsonLoggerService],
})
export class AppModule { }