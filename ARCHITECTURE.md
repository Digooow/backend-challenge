# Architecture & Technical Decisions

Este documento descreve as decisões arquiteturais e os trade-offs assumidos para satisfazer os requisitos rigorosos (e restrições eliminatórias) do desafio técnico da Jungle Gaming.

## 1. Stack e Infraestrutura
- **Runtime & Ecossistema:** Bun 1.x e NestJS. O Bun foi adotado pela sua velocidade de execução e test runner nativo ultrarrápido, essencial para rodar suites de concorrência intensas.
- **ORM:** MikroORM v6. Escolhido pelo seu suporte nativo ao padrão *Unit of Work*, *Identity Map* explícito e controlo granular sobre transações e locks (essencial para o domínio financeiro).
- **Base de Dados:** PostgreSQL 15.
- **Mensageria:** AWS SQS emulado localmente via LocalStack.

## 2. Precisão Financeira e Modelo de Domínio
- **Money Value Object:** O sistema não utiliza `number`, `float` ou `double`. Todos os valores monetários são encapsulados numa classe `Money` imutável, suportada internamente por bibliotecas de precisão decimal (`decimal.js`/`big.js`). No banco de dados, os valores são armazenados como `NUMERIC(20,2)`.
- **Wallet (Aggregate Root):** Protege as invariantes de negócio. Garante que o saldo nunca fica negativo. 
- **WalletLedgerEntry:** Implementa o conceito de *append-only*. Toda a alteração de saldo gera uma entrada imutável correspondente. Um check nativo de banco garante que `balance_before + amount = balance_after`.

## 3. Estratégia de Concorrência (Pessimistic Locking)
Para cumprir o requisito de suportar múltiplas instâncias e resolver o problema de "hot wallets" (ex: 50 apostas simultâneas na mesma carteira), optou-se pelo **Pessimistic Locking** (`LockMode.PESSIMISTIC_WRITE` gerando `SELECT ... FOR UPDATE` no PostgreSQL).

**Justificativa:**
Embora o Optimistic Locking (`version`) seja útil para sistemas com baixa contenção, em cenários de iGaming onde uma carteira pode receber rajadas de eventos simultâneos, o locking otimista geraria uma alta taxa de rejeições técnicas (conflitos de versão) e exigiria complexas lógicas de *retry* exponencial na camada de aplicação. O lock pessimista delega o enfileiramento transacional diretamente ao PostgreSQL, garantindo que as operações ocorram sequencialmente a nível de linha, sem *lost updates*, sem saldo negativo e mantendo o determinismo absoluto demonstrado nos testes de stress.

## 4. Consistência Transacional (Inbox e Outbox)
O sistema evita a falha clássica de "publicar o evento na fila antes de commitar no banco". A consistência é garantida pelo padrão **Transactional Outbox & Inbox**.
- **Atomicidade:** A transação do domínio (`Wallet`, `WagerTransaction`, `WalletLedgerEntry`), o registo de deduplicação (`InboxMessage`) e o evento de integração (`OutboxMessage`) são gravados na mesma exata transação SQL via `UnitOfWork`.
- **Worker Desacoplado:** Um Cron/Worker em background faz *polling* da tabela Outbox e publica de forma segura no SQS, garantindo a entrega *at-least-once*.
- **Idempotência Persistente:** Rejeitamos o uso de cache em memória (ex: Redis). A idempotência é controlada a nível de banco de dados verificando chaves únicas (`idempotencyKey`) ou pelo `Inbox` antes de iniciar uma nova transação financeira.

## 5. Referências Ausentes e Assincronismo
- Uma transação do tipo `REFUND` ou `ROLLBACK` pode chegar antes da `BET` original devido ao assincronismo do provedor.
- O sistema assume o estado `PENDING_REFERENCE` de forma segura. Um worker em background efetua *retries* programados até a referência original surgir e ser transacionada, finalizando o fluxo. 

## 6. Estratégia de Testes
Em vez de depender de mocks que mascaram falhas de integração, os testes foram desenhados sobre instâncias reais através do Docker Compose:
- **Testes de Integração:** Validam o fluxo completo interagindo com o PostgreSQL real e LocalStack. Para evitar falhas da API de *schema generation* em runtime, os scripts de setup (como `setup-test-db.ts`) implementam um *fallback* robusto com instruções SQL nativas (`DROP SCHEMA public CASCADE...`).
- **Testes de Concorrência:** O comportamento atómico foi comprovado matematicamente disparando dezenas de instâncias de `Promise.all` simultâneas contra o Unit of Work, atestando a eficácia do isolamento transacional.