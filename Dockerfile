# One image, two entrypoints: the web app and the worker (plan.md §10).
# Build the web target with `docker build --target web .` and the worker with `--target worker`.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @orov/web build

FROM build AS web
ENV NODE_ENV=production
EXPOSE 3000
# Migrations run before the server starts. Drizzle's migrator is idempotent, but two replicas
# starting at the same moment can race, so run one replica at a time during a schema change.
CMD ["sh", "-c", "pnpm --filter @orov/db db:migrate && pnpm --filter @orov/web start -H 0.0.0.0 -p 3000"]

FROM build AS worker
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@orov/worker", "start"]
