# Architecture & Technical Decisions

Este documento descreve detalhadamente as decisões arquiteturais, padrões implementados, garantias de concorrência e o estado operacional do serviço financeiro distribuído desenvolvido para o desafio da Jungle Gaming.

---

## 1. Estado Atual da Aplicação (Operacional & Validado)

O ecossistema encontra-se **completamente integrado, compilando sem erros e validado em tempo de execução**:
- **Servidor HTTP (NestJS):** Inicializa com sucesso mapeando todas as rotas de API:
  - `GET /health/live`: Verificação de liveness do processo.
  - `GET /health/ready`: Verificação de prontidão (PostgreSQL + AWS SQS LocalStack).
  - `GET /metrics`: Telemetria em tempo real (transações por status, retries, latências p50/p95, outbox lag, etc.).
  - `POST /wallets`: Criação de carteira com transação de abertura atômica e proteção contra duplicidade (`409 Conflict`).
  - `GET /wallets/:walletId`: Consulta de dados e saldo da carteira.
  - `GET /wallets/:walletId/ledger`: Extrato paginado com cursor opaco e estável.
  - `POST /wallets/:walletId/reconciliation`: Reconciliação matemática entre saldo persistido e soma do ledger.
  - `POST /wagering/transactions`: Processamento com idempotência persistente e respostas semânticas (`200 OK`, `202 Accepted`, `422 Unprocessable Entity`, `409 Conflict`).
  - `GET /wagering/transactions/:transactionId`: Consulta de transação por ID interno.
  - `GET /providers/:providerId/wagering/transactions/:externalTransactionId`: Consulta por par provedor + ID externo.
- **Jobs & Workers Ativos:**
  - `OutboxRelayWorker`: Publicador assíncrono dos eventos pendentes com backoff exponencial.
  - `PendingReferenceWorker`: Reprocessador de transações órfãs (`PENDING_REFERENCE`) com resolução de referências e controle de TTL.
  - `WagerSqsConsumer`: Consumidor SQS FIFO com deduplicação via Inbox Pattern persistente e ACK estritamente pós-commit.
- **Testes Unitários:** 30/30 testes passando com 100% de sucesso usando o runner nativo do Bun (`bun test test/unit`).
- **Diferencial Opcional Adicionado:** Teste de carga reproduzível via `bun run test:load`.

---

## 2. Stack Tecnológica e Decisões de Engenharia

| Componente | Tecnologia | Decisão Técnica e Justificativa |
|---|---|---|
| **Runtime & Test Runner** | **Bun 1.x** / Node.js | Adotado pelo desempenho ultrarrápido na execução de suítes de concorrência e suporte nativo a TypeScript. |
| **Framework** | **NestJS 10.x** | Arquitetura modular, injeção de dependência limpa com separação estrita de camadas (Domain, Application, Infrastructure, Presentation). |
| **ORM & Persistence** | **MikroORM v6** | Escolhido sobre TypeORM/Prisma por implementar explicitamente os padrões *Unit of Work* e *Identity Map*, controle preciso de transações e suporte nativo a `LockMode.PESSIMISTIC_WRITE`. |
| **Banco de Dados** | **PostgreSQL 15** | Banco relacional robusto com isolamento transacional ACID, constraints e checks a nível de schema. |
| **Mensageria** | **AWS SQS FIFO (LocalStack)** | Garantia de ordem de entrega por `MessageGroupId` (particionado por `walletId`) e deduplicação primária via `MessageDeduplicationId`. |
| **Containerização** | **Docker Compose** | Ambientes padronizados para PostgreSQL (porta `5433` mapeada) e LocalStack v3.8.0 (porta `4566`). |

---

## 3. Modelo de Domínio e Precisão Monetária

### 3.1 Precisão Financeira (`Money` Value Object)
- **Eliminação Absoluta de `float`/`number`:** Todo valor monetário é gerido como `Decimal` de precisão arbitrária (`big.js`), com escala fixa em **2 casas decimais** e moeda ISO-4217 (ex: `BRL`).
- **Imutabilidade Estrutural:** Instâncias de `Money` são imutáveis; cada operação (`add`, `subtract`, `negate`) instancia um novo objeto.
- **Validação de Entrada:** Strings monetárias são validadas contra notação científica, `NaN`, `Infinity`, números negativos de entrada e escalas inválidas. Operações entre moedas distintas lançam erro de domínio imediato.
- **Persistência Exata:** No PostgreSQL, os valores são armazenados estritamente como colunas `NUMERIC(19, 2)` com coluna de moeda separada.

### 3.2 Agregado `Wallet` e Invariantes
- Construtor protegido e ciclo de vida controlado por fábricas estáticas (`Wallet.open`, `Wallet.rehydrate`).
- Abertura com saldo positivo gera automaticamente a transação interna `OPENING` e seu lançamento correspondente no ledger na mesma transação.
- **Constraint de unicidade:** `UNIQUE(player_id, currency)` no banco de dados.
- **Invariante de Não-Negatividade:** Saldo nunca negativo garantido no agregado e com constraint física `CHECK (balance >= 0)`.
- **Versionamento:** Campo `version` inicializado em `1` e incrementado estritamente a cada alteração de saldo efetiva.

### 3.3 Imutabilidade do `WalletLedgerEntry` (*Append-Only*)
- Nenhuma entrada de ledger pode ser atualizada ou deletada (`append-only`).
- Cada débito ou crédito gera exatamente uma entrada vinculada a uma `WagerTransaction`.
- Validação aritmética na factory: `balanceBefore ± money === balanceAfter`.
- Reversões parciais são proibidas; transações rejeitadas (`REJECTED`) ou sem efeito (`LOSS`) não criam entradas no ledger.

---

## 4. Estratégia de Concorrência e Lock (Pessimistic Locking)

Para garantir consistência absoluta em cenários de alta concorrência ("hot wallets" recebendo dezenas de apostas simultâneas de múltiplos provedores e instâncias):

### 4.1 Escolha do Lock Pessimista (`SELECT ... FOR UPDATE`)
- **Justificativa frente ao Lock Otimista:** O lock otimista (`version`) geraria rejeições em cascata ou demandaria algoritmos complexos de retry com backoff exponencial que degradariam o throughput e a latência de checkout de iGaming.
- O lock pessimista (`findByIdForUpdate` via `LockMode.PESSIMISTIC_WRITE`) enfileira com segurança as transações que afetam a mesma carteira diretamente a nível de linha no PostgreSQL.
- **Escopo do Lock:** O lock é restrito à linha da `Wallet` em questão (`walletId`), permitindo paralelismo irrestrito entre carteiras distintas.

---

## 5. Idempotência e Consistência Transacional (Inbox & Outbox)

### 5.1 Idempotência Persistente
- Rejeição completa de cache em memória (ex: Redis volátil).
- Chave de idempotência no header HTTP `Idempotency-Key` (default: `{providerId}:{externalTransactionId}`) com constraint `UNIQUE` persistente em banco.
- **JSON Canônico & Hash de Payload:** O hash do payload é calculado via `SHA-256` sobre um JSON canônico ordenado dos dados de negócio.
  - Se a mesma chave chega com payload idêntico → retorno imediato do resultado original com flag `idempotentReplay: true`.
  - Se a mesma chave chega com payload divergente → rejeição com conflito `409 Conflict` (`PAYLOAD_MISMATCH`).

### 5.2 Transactional Outbox Pattern
- A escrita da `WagerTransaction`, o update de saldo na `Wallet`, o registro no `WalletLedgerEntry` e o enfileiramento do evento na tabela `outbox_messages` ocorrem na **mesma transação SQL** atômica.
- O `OutboxRelayWorker` extrai mensagens pendentes com retry e backoff exponencial e publica no AWS SQS FIFO.
- **Classes Concretas de Eventos:**
  - `WalletBalanceChanged`: Publicado sempre que o saldo da carteira é modificado.
  - `WagerTransactionProcessed`: Publicado para qualquer transação financeira aplicada com sucesso (inclusive `LOSS`).
  - `WagerTransactionRejected`: Publicado sempre que uma transação for rejeitada por regras de negócio.
  - `WagerTransactionPendingReference`: Publicado quando uma reversão não encontra a transação de referência no momento da chegada.

### 5.3 Inbox Pattern no Consumidor SQS
- O consumidor SQS (`WagerSqsConsumer`) consulta a tabela `inbox_messages` por `(consumer_name, message_id)`.
- Se a mensagem já foi processada, realiza o `ACK` sem reprocessamento.
- O hash do payload do inbox é armazenado como digest SHA-256 (64 hex characters), respeitando a constraint de tamanho `varchar(255)`.
- O `ACK` (remoção da mensagem do SQS) só é executado **estritamente após o commit** da transação no banco. Em caso de falha de banco, o SQS redelivery ocorre normalmente.

---

## 6. Tratamento de Assincronismo e Regras de Negócio de Reversão

As regras de negócio da Seção 7 do desafio foram implementadas e testadas unitariamente:
1. `REFUND` e `ROLLBACK` exigem obrigatoriamente `referenceExternalTransactionId`.
2. A referência é resolvida por `(providerId, referenceExternalTransactionId)` e valida se pertence ao mesmo jogador, carteira, moeda e rodada.
3. `REFUND` só pode referenciar uma `BET`. `ROLLBACK` pode referenciar `BET`, `WIN` ou `REFUND`. Violações resultam em `FailureCode.InvalidReferenceKind`.
4. Uma referência não pode ser revertida duas vezes pelo mesmo tipo de operação (`FailureCode.ReferenceAlreadyReverted`).
5. O valor de reversão deve ser estritamente igual ao valor da referência (`FailureCode.InvalidAmount`).
6. Se a transação referenciada ainda não existir no momento da chegada, a transação assume o estado não-terminal `PENDING_REFERENCE`.
7. O `PendingReferenceWorker` reprocessa transações pendentes a cada ciclo de polling; caso o TTL de espera expire sem que a referência surja, transiciona para `REJECTED` com `FailureCode.ReferenceNotFound` e emite o evento na Outbox.
8. Reversão que produziria saldo negativo (ex: rollback de WIN sem saldo restante na carteira) é rejeitada com código específico: `FailureCode.NegativeBalanceProduced`.

---

## 7. Autenticação e Extensibilidade

- Em conformidade com a Seção 2 do regulamento do desafio, foi implementado o `ProviderAuthGuard` em modo *no-op* estruturado.
- O guard injeta a identidade do provedor (`x-provider-id` ou header de autenticação) permitindo transição direta para um IdP corporativo externo (como Keycloak ou Zitadel via OpenID Connect) sem modificação da regra de domínio.
- Endpoints de health (`/health/live` e `/health/ready`) e métricas (`/metrics`) operam explicitamente sem autenticação.

---

## 8. Observabilidade e Telemetria

- **Logs Estruturados:** Implementado via `JsonLoggerService` no padrão JSON contendo `timestamp`, `level`, `context` e `message`. Dados sensíveis como senhas e detalhes confidenciais são removidos automaticamente.
- **Métricas do Sistema (`MetricsService`):**
  - Expostas via endpoint `GET /metrics`.
  - Monitoram: contadores por status de transação (`PROCESSED`, `REJECTED`, `PENDING_REFERENCE`, `FAILED`), duplicatas detectadas, retries totais, mensagens em DLQ, conflitos de lock, outbox lag e latência média/p95/p99 de processamento.
- **Health Checks:**
  - `GET /health/live`: Verifica a liveness do processo Node.js/Bun.
  - `GET /health/ready`: Valida conectividade real com PostgreSQL (`SELECT 1`) e LocalStack SQS (`/_localstack/health`).

---

## 9. Diferenciais Opcionais Implementados

- **Teste de Carga Automatizado (`bun run test:load`):**
  - Script que simula rajadas de requisições concorrentes disparadas via Bun.
  - Calcula Throughput (RPS), percentis de latência (p50, p95, p99), taxa de erro e valida a reconciliação final da carteira ao término do teste.
