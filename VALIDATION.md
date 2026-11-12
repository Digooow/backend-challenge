# Validation & Engineering Evidence Report

Este documento consolida a matriz de validação do **Distributed Wagering Processor**, cobrindo testes unitários, de integração com banco de dados real, os **8 cenários obrigatórios de concorrência e resiliência (Seção 13)** e o experimento de carga automatizado.

---

## 1. Resumo da Matriz de Testes

| Suíte | Arquivo | Escopo Validado | Status |
|---|---|---|---|
| **Unit — Domain (`Money`)** | [`test/unit/domain/money.spec.ts`](./test/unit/domain/money.spec.ts) | Precisão decimal fixa (2 casas), imutabilidade, rejeição de números nativos, notação científica, negativos na entrada e moedas fora do padrão ISO-4217. | **PASS (5/5)** |
| **Unit — Domain (`Wallet`)** | [`test/unit/domain/wallet.spec.ts`](./test/unit/domain/wallet.spec.ts) | Abertura com e sem saldo inicial, geração atômica de `OPENING` transaction + ledger entry, débito/crédito, incremento de `version`, invariante `balance >= 0` e validação de moeda. | **PASS (5/5)** |
| **Unit — Domain (`WagerTransaction`)** | [`test/unit/domain/wager-transaction.spec.ts`](./test/unit/domain/wager-transaction.spec.ts) | Ciclo de estados, imutabilidade pós-estado terminal, proibição de `OPENING` externo ou valor zero, direção contábil de `ROLLBACK` (`BET` vs `WIN`). | **PASS (7/7)** |
| **Unit — Application (`ProcessWagerTransactionUseCase`)** | [`test/unit/application/process-wager-transaction.use-case.spec.ts`](./test/unit/application/process-wager-transaction.use-case.spec.ts) | `BET`, `WIN` (com e sem referência a `BET`), `LOSS`, `REFUND`, `ROLLBACK`, `PENDING_REFERENCE`, resolução proativa quando a `BET` chega depois, idempotência com saldo histórico original (Regra 7), `PAYLOAD_MISMATCH` (`409`), `NEGATIVE_BALANCE_PRODUCED`, validação de titularidade (`playerId`). | **PASS (17/17)** |
| **Unit — Application (`ReconcileWalletUseCase`)** | [`test/unit/application/reconcile-wallet.use-case.spec.ts`](./test/unit/application/reconcile-wallet.use-case.spec.ts) | Consistência matemática `wallet.balance == SUM(ledger)` e detecção/alerta de divergência. | **PASS (2/2)** |
| **Unit — Infrastructure, Messaging, Workers & HTTP** | [`test/unit/infrastructure/messaging-and-http.spec.ts`](./test/unit/infrastructure/messaging-and-http.spec.ts) | Rehidratação `null`/`undefined` de `InboxMessage` e `OutboxMessage`, deduplicação no `WagerSqsConsumer`, filtro de eventos do Outbox, roteamento imediato para DLQ em JSON malformado, backoff exponencial via `ChangeMessageVisibilityCommand`, `PendingReferenceWorker` com `SKIP LOCKED` e backoff, cursor opaco keyset Base64, `DomainExceptionFilter` (`400`/`404`/`409`/`422`/`503`) e percentis `p50`/`p95`/`p99` + Prometheus no `MetricsService`. | **PASS (12/12)** |
| **Integration — End-to-End & Trigger Append-Only** | [`test/integration/wager-flow.spec.ts`](./test/integration/wager-flow.spec.ts) & [`test/integration/wager-processing.spec.ts`](./test/integration/wager-processing.spec.ts) | Persistência transacional completa no PostgreSQL, Outbox, Inbox com SQS Consumer, paginação keyset com cursor opaco, saldo histórico no replay idempotente e bloqueio físico de `UPDATE`/`DELETE` via trigger `trg_wallet_ledger_entries_append_only`. | **PASS (6/6)** |
| **Concurrency & Resilience (Seção 13.1 a 13.8)** | [`test/concurrency/wallet-race-condition.spec.ts`](./test/concurrency/wallet-race-condition.spec.ts) | Todos os 8 cenários obrigatórios de corrida, múltiplas instâncias, redelivery pós-queda de worker, `SKIP LOCKED` no Outbox e resolução concorrente de `PENDING_REFERENCE`. | **PASS (6/6)** |

---

## 2. Cobertura dos 8 Cenários Obrigatórios de Concorrência (Seção 13)

1. **Cenário 13.1 — 50 Apostas Idênticas Simultâneas (Mesma `Idempotency-Key`):**
   - **Execução:** 50 chamadas paralelas em instâncias isoladas com a mesma `Idempotency-Key`.
   - **Resultado:** 1 processamento original (`idempotentReplay: false`) + 49 replays idempotentes (`idempotentReplay: true`), `0` erros `500`, exatamente 1 débito no ledger e reconciliação `consistent: true`.
2. **Cenário 13.2 — 50 Apostas Distintas Simultâneas de `80.00` em Saldo de `100.00`:**
   - **Execução:** 50 chamadas paralelas de `80.00` sobre a mesma carteira com saldo `100.00`.
   - **Resultado:** 1 `PROCESSED` (saldo final `20.00`) e 49 `REJECTED` (`INSUFFICIENT_BALANCE`), apenas 2 entradas no ledger (`OPENING` + 1 `BET`).
3. **Cenário 13.3 — Operações Concorrentes em Carteiras Distintas:**
   - **Execução:** 10 carteiras processando apostas em paralelo.
   - **Resultado:** Paralelismo total sem bloqueio cruzado (lock isolado por linha de `wallet_id`).
4. **Cenário 13.4 — Múltiplas Instâncias (≥ 3 Réplicas) Operando Concorrentemente:**
   - **Execução:** 3 instâncias independentes processando 30 transações simultâneas contra a mesma carteira + infraestrutura `docker-compose.yml` com `api-1`, `api-2`, `api-3` atrás do Nginx.
   - **Resultado:** Saldo final exato e 31 lançamentos íntegros no ledger.
5. **Cenário 13.5 — Queda de Worker Após Commit e Antes do ACK no SQS:**
   - **Execução:** Simulação de falha de rede no `DeleteMessageCommand` após o commit da transação SQL, seguida de redelivery da mensagem SQS para uma segunda instância.
   - **Resultado:** A tabela `inbox_messages` deduplica a segunda entrega, confirma o ACK no SQS e impede débito duplicado.
6. **Cenário 13.6 — Dois `OutboxPublisher`s Concorrentes (`FOR UPDATE SKIP LOCKED`):**
   - **Execução:** Duas instâncias do `OutboxPublisher` varrendo `outbox_messages` simultaneamente.
   - **Resultado:** `0` eventos publicados em duplicidade graças ao `LockMode.PESSIMISTIC_PARTIAL_WRITE`.
7. **Cenário 13.7 — `REFUND` Chegando Antes da `BET` (`PENDING_REFERENCE`):**
   - **Execução:** `REFUND` chega primeiro (`202 Accepted` / `PENDING_REFERENCE`), `BET` chega em seguida e dois `PendingReferenceWorker`s concorrentes executam simultaneamente.
   - **Resultado:** O `REFUND` é resolvido para `PROCESSED` uma única vez e o saldo retorna a `100.00` com 3 entradas no ledger (`OPENING`, `BET`, `REFUND`).
8. **Cenário 13.8 — Reconciliação Matemática e Recuperação de Estado:**
   - **Execução:** Validação de `ReconcileWalletUseCase` via agregação nativa SQL (`SUM`) após todas as baterias de concorrência.
   - **Resultado:** `storedBalance == calculatedBalance` (`difference: "0.00"`, `consistent: true`).

---

## 3. Como Executar a Validação Completa

```bash
# 1. Compilação estrita TypeScript (strict: true)
bun run build

# 2. Suíte de Testes Unitários (48 testes em 6 arquivos, sem dependência de Docker)
bun run test:unit

# 3. Subir banco e mensageria de teste via Docker Compose
docker compose -f docker-compose.test.yml up -d

# 4. Suíte de Integração e Concorrência (PostgreSQL 15 + Triggers + Locks Reais)
bun run test:integration
bun run test:concurrency

# 5. Subir cluster completo Multi-Instância (Nginx LB + 3 Réplicas API + Postgres + LocalStack)
docker compose up -d --build

# 6. Executar Experimento de Carga e Estresse de Hot Wallet
bun run test:load
```
