FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN bun run build

FROM oven/bun:1.1-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/infrastructure/database/migrations ./src/infrastructure/database/migrations
COPY --from=builder /app/src/infrastructure/database/mikro-orm.config.ts ./src/infrastructure/database/mikro-orm.config.ts

EXPOSE 3000

CMD ["sh", "-c", "bun run src/infrastructure/database/run-migrations.ts up && bun run dist/infrastructure/nest/main.js"]
