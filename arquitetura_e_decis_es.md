# Decisões Arquiteturais e Trade-offs

Este documento detalha as escolhas de engenharia, padrões de projeto e estratégias de infraestrutura adotadas para o Distributed Wagering Processor, focando em consistência financeira, resiliência e alta concorrência.

## 1. Autenticação e Identidade
**Decisão:** Não implementação de um provedor de identidade (IdP) real no escopo deste desafio, utilizando um `MockAuthGuard` injetável.
**Justificativa:** Conforme as regras do desafio, a autenticação não soma pontos e não deve competir com a complexidade transacional. Em um ambiente de produção, este ponto de extensão seria integrado a um IdP externo (como **Keycloak** ou **Zitadel**) usando o fluxo OIDC (OpenID Connect). O sistema validaria o JWT no API Gateway ou via Guard do NestJS, extraindo o `providerId` das claims do token.

## 2. Stack e ORM
**Decisão:** NestJS com **MikroORM** e PostgreSQL.
**Justificativa:** O MikroORM foi escolhido em detrimento do TypeORM e Prisma devido à sua implementação nativa dos padrões *Unit of Work* e *Identity Map*. A API do `EntityManager.transactional()` permite que as alterações na `Wallet`, criação da `WalletLedgerEntry` e registros de `Inbox`/`Outbox` sejam orquestrados em uma única transação SQL atômica com facilidade, sem vazamento de escopo de conexão.

## 3. Precisão Financeira (Money)
**Decisão:** Uso do padrão *Value Object* (`Money`) encapsulando a biblioteca `big.js` (ou `decimal.js`).
**Justificativa:** Para evitar falhas eliminatórias envolvendo ponto flutuante (`float`/`double`), o tipo `number` do TypeScript foi banido do domínio financeiro. O VO `Money` aceita e devolve apenas strings com 2 casas decimais (ex: `"25.00"`). 
**Persistência:** No banco (PostgreSQL), os valores são armazenados como `DECIMAL(19, 4)` ou `NUMERIC` exato, e reidratados como string diretamente para as factories de `Money`.

## 4. Controle de Concorrência
**Estratégia Adotada:** *Optimistic Locking* (Locking Otimista) via coluna `version` na entidade `Wallet`.
**Justificativa:** O cenário prevê múltiplas instâncias e workers consumindo operações paralelamente. Um *Pessimistic Lock* (ex: `SELECT ... FOR UPDATE`) poderia gerar contenção (gargalo) severa no banco de dados e esgotamento do pool de conexões sob alto load. 
Com o lock otimista, a transação lê a carteira (versão N) e tenta atualizar para N+1 com a condição `WHERE id = X AND version = N`. Se duas apostas concorrem pelo mesmo saldo, o banco comitará uma e rejeitará a segunda (afetando 0 linhas). A aplicação captura esse erro de simultaneidade e executa um mecanismo de *retry* exponencial limitado.

## 5. Garantia de Idempotência
**Decisão:** Validação de unicidade e Hash de Payload delegada ao PostgreSQL.
**Justificativa:** Uso de cache em memória para idempotência é uma falha eliminatória. A idempotência é garantida por uma chave única no banco composta por `providerId` + `idempotencyKey`. Ao receber uma requisição HTTP ou mensagem SQS:
1. O banco tenta inserir o registro de idempotência.
2. Se violar a constraint `UNIQUE`, a transação já foi vista.
3. Comparamos o `payloadHash`. Se for idêntico, retornamos o status anterior (Replay seguro). Se for diferente, rejeitamos com conflito de idempotência (HTTP 409).

## 6. Padronização Inbox e Outbox
**Decisão:** *Transactional Outbox Pattern* e *Inbox Pattern* integrados na transação financeira.
**Justificativa:** É imperativo que eventos não sejam publicados antes do *commit* (regra eliminatória). 
- **Outbox:** Eventos como `WalletBalanceChanged` são persistidos na tabela `outbox_messages` na mesma transação que altera o saldo. Um *worker* em background faz o *polling* dessa tabela e publica no SQS, garantindo entrega *at-least-once*.
- **Inbox:** Para requisições vindas do SQS, gravamos a `messageId` na tabela `inbox_messages` dentro da transação principal. O *ack* para o broker só ocorre após o commit com sucesso.

## 7. Referências e Falhas (Taxonomia)
As seguintes falhas de negócio são mapeadas, mantendo códigos determinísticos para o provedor:
- `INSUFFICIENT_FUNDS`: Aposta rejeitada por falta de saldo. (Terminal)
- `REFERENCE_NOT_FOUND`: Uma transação REFUND/ROLLBACK não encontrou a referência após esgotar o TTL de *Pending Reference*.
- `INVALID_STATE_TRANSITION`: Tentativa de estorno de uma aposta já estornada ou falha na regra de negócio.
- `PAYLOAD_CONFLICT`: Mesma chave de idempotência para conteúdos diferentes.
- `CURRENCY_MISMATCH`: Moeda da transação não bate com a da Wallet.

As transações pendentes de referência ficam marcadas como `PENDING_REFERENCE` e um *Cron Job/Worker* as reavalia periodicamente usando um backoff exponencial (ex: tenta em 1s, 5s, 15s) até um TTL máximo de 5 minutos, após o qual ela falha definitivamente.