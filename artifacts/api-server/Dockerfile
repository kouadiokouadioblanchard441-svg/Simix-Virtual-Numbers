# ─── Stage 1: Builder ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy monorepo root config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Copy all workspace lib packages that api-server depends on
COPY lib/db ./lib/db
COPY lib/api-zod ./lib/api-zod
COPY lib/api-spec ./lib/api-spec
COPY lib/integrations-openai-ai-server ./lib/integrations-openai-ai-server
COPY lib/integrations ./lib/integrations

# Copy the api-server artifact
COPY artifacts/api-server ./artifacts/api-server

# Install all dependencies from monorepo root
RUN pnpm install --filter @workspace/api-server... --frozen-lockfile=false

# Build the api-server (esbuild bundles everything into dist/index.mjs)
RUN pnpm --filter @workspace/api-server run build

# ─── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# esbuild bundles all dependencies, only the dist/ directory is needed
COPY --from=builder /app/artifacts/api-server/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
