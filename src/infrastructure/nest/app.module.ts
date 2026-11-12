import { EntityManager } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ScheduleModule } from '@nestjs/schedule';
import { getMikroOrmConfig } from '../database/mikro-orm.config';
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
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { ReconcileWalletUseCase } from '../../application/use-cases/reconcile-wallet.use-case';

// Messaging
import { LocalstackSqsClient } from '../messaging/sqs/localstack-sqs.client';
import { OutboxPublisher } from '../messaging/outbox/outbox.publisher';
import { OutboxRelayWorker } from '../jobs/outbox-relay.worker';
import { WagerSqsConsumer } from '../messaging/sqs/wager-sqs.consumer';

// Observability
import { JsonLoggerService } from '../observability/json-logger.service';
import { MetricsService } from '../observability/metrics.service';

@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      useFactory: () => getMikroOrmConfig() as any,
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [HealthController, WalletController, WagerController],
  providers: [
    JsonLoggerService,
    MetricsService,
    { provide: 'WalletRepositoryPort', useFactory: (em) => new MikroOrmWalletRepository(em), inject: [EntityManager] },
    { provide: 'WagerTransactionRepositoryPort', useFactory: (em) => new MikroOrmWagerTransactionRepository(em), inject: [EntityManager] },
    { provide: 'OutboxRepositoryPort', useFactory: (em) => new MikroOrmOutboxRepository(em), inject: [EntityManager] },
    { provide: 'UnitOfWorkPort', useFactory: (em) => new MikroOrmUnitOfWork(em), inject: [EntityManager] },
    { provide: 'MessagePublisherPort', useClass: LocalstackSqsClient },
    {
      provide: PendingReferenceWorker,
      useFactory: (wagerTxRepo, useCase, uow, metrics) =>
        new PendingReferenceWorker(wagerTxRepo, useCase, uow, metrics),
      inject: ['WagerTransactionRepositoryPort', ProcessWagerTransactionUseCase, 'UnitOfWorkPort', MetricsService],
    },
    { provide: 'InboxRepositoryPort', useFactory: (em) => new MikroOrmInboxRepository(em), inject: [EntityManager] },

    // Domain Use Cases
    {
      provide: CreateWalletUseCase,
      useFactory: (walletRepo, uow, wagerTxRepo) =>
        new CreateWalletUseCase(walletRepo, uow, wagerTxRepo),
      inject: ['WalletRepositoryPort', 'UnitOfWorkPort', 'WagerTransactionRepositoryPort'],
    },
    {
      provide: ProcessWagerTransactionUseCase,
      useFactory: (walletRepo, wagerTxRepo, outboxRepo, uow, metrics) =>
        new ProcessWagerTransactionUseCase(walletRepo, wagerTxRepo, outboxRepo, uow, metrics),
      inject: [
        'WalletRepositoryPort',
        'WagerTransactionRepositoryPort',
        'OutboxRepositoryPort',
        'UnitOfWorkPort',
        MetricsService,
      ],
    },
    {
      provide: ReconcileWalletUseCase,
      useFactory: (walletRepo, metrics) => new ReconcileWalletUseCase(walletRepo, metrics),
      inject: ['WalletRepositoryPort', MetricsService],
    },

    // Background Workers
    {
      provide: OutboxPublisher,
      useFactory: (outboxRepo, publisher, uow, metrics) =>
        new OutboxPublisher(
          outboxRepo,
          publisher,
          uow,
          process.env.SQS_OUTBOX_QUEUE_URL ||
            process.env.SQS_WAGER_QUEUE_URL ||
            `${process.env.SQS_ENDPOINT || 'http://localhost:4566'}/000000000000/wager-transactions.fifo`,
          metrics,
        ),
      inject: ['OutboxRepositoryPort', 'MessagePublisherPort', 'UnitOfWorkPort', MetricsService],
    },
    OutboxRelayWorker,
    {
      provide: WagerSqsConsumer,
      useFactory: (useCase, inboxRepo, uow, metrics) =>
        new WagerSqsConsumer(useCase, inboxRepo, uow, metrics),
      inject: [ProcessWagerTransactionUseCase, 'InboxRepositoryPort', 'UnitOfWorkPort', MetricsService],
    },
  ],
  exports: [JsonLoggerService, MetricsService],
})
export class AppModule {}
