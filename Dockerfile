# One image, two entrypoints: the web app and the worker (plan.md §10).
# Build the web target with `docker build --target web .` and the worker with `--target worker`.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @orov/web build

# Both targets run as the unprivileged `node` user. The app's files stay owned by root, so a
# compromised process can't rewrite the code it runs; only Next's cache is writable. The
# commands call the workspace's own binaries rather than pnpm, which corepack would otherwise
# try to download into the node user's home on first start.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p apps/web/.next/cache && chown -R node:node apps/web/.next/cache
USER node

FROM runtime AS web
EXPOSE 3000
# Migrations run before the server starts. Drizzle's migrator is idempotent, but two replicas
# starting at the same moment can race, so run one replica at a time during a schema change.
# `exec` hands PID 1 to Next, so it receives the container's stop signal.
CMD ["sh", "-c", "cd packages/db && node_modules/.bin/tsx migrate.ts && cd ../../apps/web && exec node_modules/.bin/next start -H 0.0.0.0 -p 3000"]

FROM runtime AS worker
WORKDIR /app/apps/worker
CMD ["node_modules/.bin/tsx", "src/index.ts"]
