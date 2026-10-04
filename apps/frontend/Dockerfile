FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/frontend/ ./apps/frontend/
COPY packages/shared/ ./packages/shared/
# Type-only import of the backend router (for tRPC types) is resolved at build time.
COPY apps/backend/src/ ./apps/backend/src/

WORKDIR /app/apps/frontend
RUN bun run build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/frontend/security-headers.conf /etc/nginx/snippets/security-headers.conf
EXPOSE 80
