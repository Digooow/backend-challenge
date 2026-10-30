"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const postgresql_1 = require("@mikro-orm/postgresql");
const common_1 = require("@nestjs/common");
const nestjs_1 = require("@mikro-orm/nestjs");
const schedule_1 = require("@nestjs/schedule");
const mikro_orm_config_1 = require("../database/mikro-orm.config");
const pending_reference_worker_1 = require("../jobs/pending-reference.worker");
const mikro_orm_inbox_repository_1 = require("../database/repositories/mikro-orm-inbox.repository");
const health_controller_1 = require("../../presentation/controllers/health.controller");
const wallet_controller_1 = require("../../presentation/controllers/wallet.controller");
const wager_controller_1 = require("../../presentation/controllers/wager.controller");
const mikro_orm_wallet_repository_1 = require("../database/repositories/mikro-orm-wallet.repository");
const mikro_orm_wager_transaction_repository_1 = require("../database/repositories/mikro-orm-wager-transaction.repository");
const mikro_orm_outbox_repository_1 = require("../database/repositories/mikro-orm-outbox.repository");
const unit_of_work_1 = require("../database/unit-of-work");
const process_wager_transaction_use_case_1 = require("../../application/use-cases/process-wager-transaction.use-case");
const reconcile_wallet_use_case_1 = require("../../application/use-cases/reconcile-wallet.use-case");
const localstack_sqs_client_1 = require("../messaging/sqs/localstack-sqs.client");
const outbox_publisher_1 = require("../messaging/outbox/outbox.publisher");
const outbox_relay_worker_1 = require("../jobs/outbox-relay.worker");
const wager_sqs_consumer_1 = require("../messaging/sqs/wager-sqs.consumer");
const json_logger_service_1 = require("../observability/json-logger.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nestjs_1.MikroOrmModule.forRoot(mikro_orm_config_1.default),
            schedule_1.ScheduleModule.forRoot(),
        ],
        controllers: [health_controller_1.HealthController, wallet_controller_1.WalletController, wager_controller_1.WagerController],
        providers: [
            json_logger_service_1.JsonLoggerService,
            { provide: 'WalletRepositoryPort', useFactory: (em) => new mikro_orm_wallet_repository_1.MikroOrmWalletRepository(em), inject: [postgresql_1.EntityManager] },
            { provide: 'WagerTransactionRepositoryPort', useFactory: (em) => new mikro_orm_wager_transaction_repository_1.MikroOrmWagerTransactionRepository(em), inject: [postgresql_1.EntityManager] },
            { provide: 'OutboxRepositoryPort', useFactory: (em) => new mikro_orm_outbox_repository_1.MikroOrmOutboxRepository(em), inject: [postgresql_1.EntityManager] },
            { provide: 'UnitOfWorkPort', useFactory: (em) => new unit_of_work_1.MikroOrmUnitOfWork(em), inject: [postgresql_1.EntityManager] },
            { provide: 'MessagePublisherPort', useClass: localstack_sqs_client_1.LocalstackSqsClient },
            {
                provide: pending_reference_worker_1.PendingReferenceWorker,
                useFactory: (wagerTxRepo, useCase, uow) => new pending_reference_worker_1.PendingReferenceWorker(wagerTxRepo, useCase, uow),
                inject: ['WagerTransactionRepositoryPort', process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase, 'UnitOfWorkPort'],
            },
            { provide: 'InboxRepositoryPort', useFactory: (em) => new mikro_orm_inbox_repository_1.MikroOrmInboxRepository(em), inject: [postgresql_1.EntityManager] },
            {
                provide: process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase,
                useFactory: (walletRepo, wagerTxRepo, outboxRepo, uow) => new process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase(walletRepo, wagerTxRepo, outboxRepo, uow),
                inject: ['WalletRepositoryPort', 'WagerTransactionRepositoryPort', 'OutboxRepositoryPort', 'UnitOfWorkPort'],
            },
            {
                provide: reconcile_wallet_use_case_1.ReconcileWalletUseCase,
                useFactory: (walletRepo) => new reconcile_wallet_use_case_1.ReconcileWalletUseCase(walletRepo),
                inject: ['WalletRepositoryPort'],
            },
            {
                provide: outbox_publisher_1.OutboxPublisher,
                useFactory: (outboxRepo, publisher, uow) => new outbox_publisher_1.OutboxPublisher(outboxRepo, publisher, uow, process.env.SQS_WAGER_QUEUE_URL || 'http://localhost:4566/000000000000/wager-transactions.fifo'),
                inject: ['OutboxRepositoryPort', 'MessagePublisherPort', 'UnitOfWorkPort'],
            },
            outbox_relay_worker_1.OutboxRelayWorker,
            {
                provide: wager_sqs_consumer_1.WagerSqsConsumer,
                useFactory: (useCase, inboxRepo, uow) => new wager_sqs_consumer_1.WagerSqsConsumer(useCase, inboxRepo, uow),
                inject: [process_wager_transaction_use_case_1.ProcessWagerTransactionUseCase, 'InboxRepositoryPort', 'UnitOfWorkPort'],
            }
        ],
        exports: [json_logger_service_1.JsonLoggerService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map