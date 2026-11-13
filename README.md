# Distributed Wagering Processor

Serviço financeiro distribuído para processamento de carteiras, ledger contábil imutável (*append-only*) e transações concorrentes de apostas (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`), construído com **TypeScript (`strict: true`)**, **NestJS 10**, **Bun**, **MikroORM v7**, **PostgreSQL 15** e **AWS SQS FIFO (LocalStack)**.

> **Documentação Técnica Detalhada:**
> - [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Camadas DDD/Hexagonal, lock pessimista com re-check pós-lock, Inbox/Outbox, retry exponencial com DLQ e trade-offs.
> - [`VALIDATION.md`](./VALIDATION.md) — Matriz de testes unitários, integração PostgreSQL, 8 cenários de concorrência/resiliência e teste de carga.

---

## Principais Garantias de Engenharia

- **Precisão Monetária:** Value Object `Money` apoiado em `big.js` (2 casas decimais, validação ISO-4217) e colunas `NUMERIC(19, 2)` no PostgreSQL, sem uso de ponto flutuante (`number`/`float`).
- **Controle de Concorrência (`SELECT ... FOR UPDATE` + Re-check Pós-Lock):** Serializa no banco apenas requisições simultâneas sobre o mesmo `walletId` (`LockMode.PESSIMISTIC_WRITE`), mantendo paralelismo horizontal entre carteiras distintas e eliminando corridas de `Idempotency-Key`.
- **Ledger Append-Only Imutável:** Cada mutação de saldo grava uma entrada em `wallet_ledger_entries` protegida por trigger `BEFORE UPDATE OR DELETE` no PostgreSQL.
- **Consistência Transacional (Outbox + Inbox + `SKIP LOCKED`):** Eventos de domínio são persistidos na mesma transação SQL em `outbox_messages` e publicados concorrentemente entre múltiplas réplicas via `LockMode.PESSIMISTIC_PARTIAL_WRITE`. O consumidor SQS (`WagerSqsConsumer`) garante deduplicação na tabela `inbox_messages` antes do ACK na fila.
- **Resolução de Referências Fora de Ordem (`PENDING_REFERENCE`):** Operações de `REFUND` ou `ROLLBACK` recebidas antes da transação referenciada são registradas como `PENDING_REFERENCE` (`202 Accepted`) e reconciliadas de forma assíncrona com backoff exponencial pelo `PendingReferenceWorker`.
- **Observabilidade & Graceful Shutdown:** Logs estruturados em JSON com `x-correlation-id` via `AsyncLocalStorage`, endpoint de métricas JSON/Prometheus (`p50`/`p95`/`p99`, lag de outbox, retries e DLQ) e encerramento gracioso no consumidor SQS em `SIGTERM`/`SIGINT`.

---

## Endpoints da API

| Método e Rota | Finalidade | Observações |
|---|---|---|
| `POST /wallets` | Cria carteira (com saldo inicial opcional) | Retorna `201 Created`; conflitos retornam `409 Conflict` |
| `GET /wallets/:walletId` | Consulta saldo atual e versão da carteira | Retorna `404` se inexistente |
| `GET /wallets/:walletId/ledger` | Extrato paginado via cursor opaco Base64 | Query params `limit` (`1..500`, padrão `50`) e `cursor` |
| `POST /wallets/:walletId/reconciliation` | Reconcilia saldo materializado contra `SUM` SQL do ledger | Detecta e contabiliza divergências |
| `POST /wagering/transactions` | Processa `BET`, `WIN`, `LOSS`, `REFUND` ou `ROLLBACK` | Exige header `Idempotency-Key`; mapeia `200`, `202`, `409`, `422` |
| `GET /wagering/transactions/:transactionId` | Consulta transação por ID interno | — |
| `GET /providers/:providerId/wagering/transactions/:externalTransactionId` | Consulta transação por chave composta do provedor | — |
| `GET /health/live` | Liveness probe do processo HTTP | — |
| `GET /health/ready` | Readiness probe validando PostgreSQL (`SELECT 1`) e SQS | Retorna `503` se alguma dependência estiver indisponível |
| `GET /metrics` / `GET /metrics/prometheus` | Métricas JSON ou formato Prometheus (`text/plain`) | Atualiza lag atual da `outbox_messages` |

---

## Arquitetura do Projeto

```text
src/
├── domain/          # Value Object Money, agregados (Wallet, WagerTransaction, Ledger, Outbox/Inbox) e exceções
├── application/     # Casos de uso (CreateWallet, ProcessWagerTransaction, ReconcileWallet), DTOs e Portas
├── infrastructure/  # MikroORM v7, migrations SQL, workers (Outbox/PendingReference), SQS Consumer, logger/métricas
└── presentation/    # Controllers REST, ProviderAuthGuard (extensível para OIDC/JWT) e DomainExceptionFilter
```

---

## Execução Local e Cluster Multi-Instância

### Pré-requisitos
- **Bun** `>= 1.1`
- **Docker** e **Docker Compose**

### Subir Infraestrutura e API

O [`docker-compose.yml`](./docker-compose.yml) provisiona PostgreSQL 15, LocalStack (SQS FIFO + DLQ), **3 réplicas stateless (`api-1`, `api-2`, `api-3`)** e balanceamento **Nginx** na porta `3000`:

```bash
# Cluster completo (PostgreSQL + LocalStack + 3 réplicas + Nginx LB em :3000)
docker compose up -d --build

# Ou apenas dependências externas para executar a API localmente em watch mode
docker compose up -d postgres localstack
bun install
bun run migration:up
bun run start:dev
```

---

## Variáveis de Ambiente (`.env.example`)

| Variável | Default | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP da aplicação NestJS |
| `INSTANCE_ID` | `api-local` | Identificador da instância nos logs e cabeçalhos |
| `DB_HOST` / `DB_PORT` | `localhost` / `5433` | Host e porta do PostgreSQL (suíte de testes usa `5434` com fallback para `5433`) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `postgres` / `postgres` / `wagering_db` | Credenciais e database |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `2` / `25` | Limites do pool de conexões por réplica |
| `SQS_ENDPOINT` | `http://localhost:4566` | Endpoint AWS SQS / LocalStack |
| `SQS_WAGER_QUEUE_URL` | `http://localhost:4566/000000000000/wager-transactions.fifo` | URL da fila principal FIFO |
| `SQS_WAGER_DLQ_URL` | `http://localhost:4566/000000000000/wager-transactions-dlq.fifo` | URL da Dead Letter Queue FIFO |

---

## Comandos (`package.json`) e Pipeline CI

| Comando | Descrição |
|---|---|
| `bun run build` | Compila o projeto com TypeScript (`strict: true`). |
| `bun run start:dev` | Inicia a aplicação NestJS em modo watch com Bun. |
| `bun run migration:up` | Aplica as migrations versionadas no PostgreSQL (`InitSchema`, constraints e trigger *append-only*). |
| `bun run test:unit` | Executa **48 testes unitários** (6 arquivos em `test/unit`, sem dependência externa). |
| `bun run test:integration` | Executa testes de integração com PostgreSQL e consumidor SQS (`test/integration`). |
| `bun run test:concurrency` | Executa os cenários de concorrência e resiliência (`test/concurrency`). |
| `bun run test:load` | Executa o experimento de carga em `test/load/load-test.ts`. |

O workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) automatiza:
1. **`build-and-unit`:** instalação determinística (`bun install --frozen-lockfile`), build estrito (`bun run build`) e execução dos testes unitários (`bun run test:unit`).
2. **`integration-and-concurrency`:** sobe um serviço **PostgreSQL 15** dedicado e executa `bun run test:integration` e `bun run test:concurrency`.
