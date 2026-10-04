FROM oven/bun:1 AS base
WORKDIR /app

# Every workspace manifest is needed for the lockfile to resolve.
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile --production

COPY tsconfig.base.json ./
COPY apps/backend/ ./apps/backend/
COPY packages/shared/ ./packages/shared/

WORKDIR /app/apps/backend
USER bun
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["bun", "run", "src/index.ts"]
