#!/bin/bash
set -e

export PORT=5000
export DATABASE_URL="${SUPABASE_DATABASE_URL:-$DATABASE_URL}"

# Build backend if dist/index.cjs is missing or stale
if [ ! -f "dist/index.cjs" ] || [ ! -f "dist/thread-stream-worker.cjs" ]; then
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
