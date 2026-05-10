# ─── Stage 1: Builder ───────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

COPY lib/api-client-react ./lib/api-client-react
COPY lib/api-spec ./lib/api-spec
COPY lib/api-zod ./lib/api-zod

COPY artifacts/simix ./artifacts/simix

RUN pnpm install --filter @workspace/simix... --frozen-lockfile=false

ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/

RUN pnpm --filter @workspace/simix run build

# ─── Stage 2: Production (nginx with dynamic PORT) ───────────────────────────
FROM nginx:1.27-alpine AS production

RUN apk add --no-cache gettext

COPY --from=builder /app/artifacts/simix/dist/public /usr/share/nginx/html

RUN printf 'server {\n\
  listen ${PORT};\n\
  listen [::]:${PORT};\n\
  server_name _;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  gzip on;\n\
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf.template

RUN printf '#!/bin/sh\n\
export PORT=${PORT:-80}\n\
envsubst '"'"'${PORT}'"'"' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf\n\
exec nginx -g "daemon off;"\n' > /docker-entrypoint-custom.sh && chmod +x /docker-entrypoint-custom.sh

ENV PORT=80

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/ || exit 1

CMD ["/docker-entrypoint-custom.sh"]
