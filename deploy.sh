#!/bin/bash
# ╔══════════════════════════════════════════════════════╗
# ║  Simix — Script de déploiement production            ║
# ║  Usage : ./deploy.sh "message de commit"             ║
# ╚══════════════════════════════════════════════════════╝

set -e

MSG="${1:-deploy: mise à jour production}"

echo ""
echo "══════════════════════════════════════"
echo "  🔨 Build en cours (API + Frontend)"
echo "══════════════════════════════════════"
pnpm run build

echo ""
echo "══════════════════════════════════════"
echo "  📦 Staging des fichiers dist/"
echo "══════════════════════════════════════"
git add dist/
git add -A

echo ""
echo "══════════════════════════════════════"
echo "  💾 Commit : $MSG"
echo "══════════════════════════════════════"
git commit -m "$MSG" || echo "(rien à commiter)"

echo ""
echo "══════════════════════════════════════"
echo "  🚀 Push vers GitHub…"
echo "══════════════════════════════════════"
git push

echo ""
echo "══════════════════════════════════════"
echo "  ✅ TERMINÉ !"
echo "  → Allez dans Plesk"
echo "  → Git → Pull → Deploy Now"
echo "  → Le serveur redémarre automatiquement"
echo "══════════════════════════════════════"
echo ""
