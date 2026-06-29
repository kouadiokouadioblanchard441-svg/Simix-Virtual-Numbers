#!/bin/bash
# ================================================================
# Simix — Script de déploiement Plesk
# Usage : ./deploy-plesk.sh
# Ce script s'exécute après chaque `git pull` sur Plesk.
# Il installe les dépendances, compile le backend + frontend,
# puis démarre le serveur Node.js.
# ================================================================

set -e

echo ""
echo "========================================"
echo " Simix — Déploiement en cours..."
echo "========================================"
echo ""

# ── 1. Installer les dépendances ─────────────────────────────────
echo "📦 Installation des dépendances..."
if command -v pnpm &> /dev/null; then
  pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1
else
  npm install -g pnpm@10.26.1
  pnpm install 2>&1
fi
echo "✔ Dépendances installées"

# ── 2. Compiler le backend (esbuild → index.cjs) ─────────────────
echo ""
echo "🔨 Compilation du backend..."
node artifacts/api-server/build.mjs
echo "✔ Backend compilé → index.cjs"

# ── 3. Compiler le frontend (Vite → public/) ─────────────────────
echo ""
echo "🎨 Compilation du frontend..."
cd artifacts/simix && NODE_ENV=production node_modules/.bin/vite build --config vite.config.ts
cd ../..
echo "✔ Frontend compilé → public/"

# ── 4. Démarrer le serveur ────────────────────────────────────────
echo ""
echo "🚀 Démarrage du serveur..."
echo "========================================"
NODE_ENV=production node --enable-source-maps index.cjs
