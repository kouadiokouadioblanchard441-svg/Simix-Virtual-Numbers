#!/bin/bash
set -e

export PORT=5000

# Build backend if any required output files are missing
NEED_BACKEND_BUILD=0
for f in dist/index.cjs dist/thread-stream-worker.cjs dist/pino-worker.cjs; do
  if [ ! -f "$f" ]; then
    NEED_BACKEND_BUILD=1
    break
  fi
done

if [ "$NEED_BACKEND_BUILD" = "1" ]; then
  echo "[start-replit] Building backend..."
  node artifacts/api-server/build.mjs
fi

# Build frontend if public/index.html is missing
if [ ! -f "public/index.html" ]; then
  echo "[start-replit] Building frontend..."
  cd artifacts/simix && NODE_ENV=production node_modules/.bin/vite build --config vite.config.ts
  cd ../..
fi

echo "[start-replit] Starting server on port $PORT..."
exec node dist/index.cjs
