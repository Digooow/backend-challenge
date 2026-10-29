# Jungle Gaming - Distributed Wagering Processor

Este projeto é a solução para o Desafio Técnico da Jungle Gaming: um serviço financeiro distribuído de alta consistência, capaz de processar transações de iGaming lidando com alta concorrência, problemas de rede e operações de partidas dobradas (ledger).

## Tecnologias Principais
- **Runtime:** Bun 1.x
- **Framework:** NestJS
- **Linguagem:** TypeScript (Strict Mode)
- **Banco de Dados:** PostgreSQL 16
- **ORM:** MikroORM
- **Mensageria:** SQS via LocalStack
- **Orquestração:** Docker Compose

---

## 🚀 Como iniciar o projeto

### Pré-requisitos
Certifique-se de ter instalado em sua máquina:
- [Bun](https://bun.sh/) (v1.x)
- [Docker](https://www.docker.com/) e Docker Compose

### Instalação
1. Clone o repositório.
2. Instale as dependências:
   ```bash
   bun install
   ```
3. Suba a infraestrutura local (PostgreSQL e LocalStack):
   ```bash
   docker-compose up -d
   ```
4. Execute as migrations do MikroORM:
   ```bash
   bun run migration:up
   ```
5. Inicie a aplicação (modo desenvolvimento):
   ```bash
   bun run start:dev
   ```

A API estará disponível em `http://localhost:3000` (porta padrão, verificar `.env`).

---

## 🧪 Testes

A suíte de testes foi desenhada para provar a resistência do sistema às condições exigidas pelo desafio. **Postgres e SQS reais são utilizados nos testes de integração e concorrência.**

### Testes Unitários
Testa as regras de negócio puras (DDD), as lógicas da classe `Money` (imutabilidade, validação decimal) e as invariantes da `Wallet`, tudo em memória e de forma instantânea.
```bash
bun test test/unit
```

### Testes de Integração
Levanta contêineres de teste via Docker, roda as migrations e testa o fluxo atômico (Wallet + Ledger + Outbox) integrando com o PostgreSQL real e LocalStack SQS.
```bash
bun run test:integration
```

### 🏎️ Teste Mestre: Concorrência e Race Conditions
Este teste prova que o sistema é à prova de *Lost Updates*. Ele injeta 50 transações de `BET` simultâneas disputando a mesma carteira para garantir que o banco e o *Optimistic Lock* resolvam a contenção e o saldo nunca fique negativo.
```bash
bun run test:concurrency
```

### Teste de Carga (Opcional/Diferencial)
Executa uma bateria de testes medindo throughput e p95/p99 do serviço usando o k6 ou ferramenta nativa do Bun.
```bash
bun run test:load
```

---

## 📁 Estrutura do Projeto (Clean Architecture)

A estrutura obedece aos preceitos do Domain-Driven Design, separando completamente as regras financeiras da tecnologia de infraestrutura:
- `src/domain/`: Regras puras, Value Objects (`Money`), Entidades (`Wallet`), Erros. (Nenhum decorator do NestJS aqui).
- `src/application/`: Casos de uso e portas (interfaces) para orquestração das requisições e eventos.
- `src/infrastructure/`: Implementação do banco, MikroORM, filas SQS e Workers do Outbox.
- `src/presentation/`: Controllers HTTP do NestJS, DTOs de entrada e tratamento de erros.

---

## 📈 Observabilidade
- **Logs:** Logs estruturados em formato JSON, embutindo `correlationId` para rastreabilidade, sem expor dados financeiros no log.
- **Health Checks:** Acessíveis nas rotas `/health/live` e `/health/ready` (sem autenticação).