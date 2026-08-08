# Full-stack event image (spec plan D6: the demo must run off any machine).
# Build from the REPO ROOT:  docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/lmsr/package.json packages/lmsr/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @poporslop/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
# Migration + seed tooling for first boot on a fresh database.
COPY --from=builder /repo/apps/web/src/server/db/migrations ./apps/web/migrations
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
