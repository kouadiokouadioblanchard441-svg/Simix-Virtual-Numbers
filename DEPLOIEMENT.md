# Déploiement Plesk — Simix

## Workflow quotidien (après configuration initiale)

```
Replit → ./deploy.sh "message"  →  GitHub  →  Plesk : Deploy Now  →  ✅ Live
```

**Aucun build, aucun npm install dans Plesk.** Tout est pré-buildé et commité dans `dist/`.

---

## Configuration initiale dans Plesk (une seule fois)

### 1. Node.js App Settings

| Paramètre | Valeur |
|---|---|
| **Application root** | `/` (racine du repo) |
| **Application startup file** | `dist/index.cjs` |
| **Node.js version** | `20.x` ou supérieur |
| **Application mode** | `production` |

> ⚠️ **Ne pas activer "Run npm install" ou "Build"** dans Plesk — tout est déjà buildé dans `dist/`.

### 2. Variables d'environnement Plesk

Définir dans **Plesk → Node.js → Environment Variables** :

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...votre-url-supabase...
SESSION_SECRET=...clé-aléatoire-64-chars...
ADMIN_ACCESS_TOKEN=...token-admin...
ADMIN_JWT_SECRET=...clé-jwt-admin...
FIVESIM_API_KEY=...votre-clé-5sim...
PAWAPAY_API_TOKEN=...votre-token-pawapay...
PAWAPAY_ENV=production
RESEND_API_KEY=...votre-clé-resend...
```

**Optionnels :**
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://votre-domaine.com/api/auth/google/callback
LOG_LEVEL=info
```

> Les clés des passerelles de paiement (Fapshi, PayDunya, etc.) se configurent
> directement depuis le panel admin → **Routage API** → Fournisseurs.
>
> Les clés IA (Gemini, OpenAI) se configurent depuis le panel admin → **Support IA → Configuration IA**.
>
> Pas besoin de les mettre ici si elles sont déjà dans le panel admin.

### 3. Git déploiement dans Plesk

Dans **Plesk → Domaine → Git** :
1. Coller l'URL du dépôt GitHub
2. Sélectionner la branche `main`
3. **Actions de déploiement** — laisser vide (Plesk utilise `npm start` → `node dist/index.cjs`)

### 4. Reverse Proxy

Configurer un proxy dans Plesk depuis votre domaine → `localhost:3000`.

---

## Workflow de mise à jour (depuis Replit)

### Option A — Script automatique (recommandé)

```bash
./deploy.sh "description de vos changements"
```

Ce script fait en une seule commande :
1. Build complet (API + frontend) → `dist/`
2. `git add dist/` + `git add -A`
3. `git commit`
4. `git push`

Ensuite dans Plesk : **Git → Deploy Now** → le serveur redémarre automatiquement. ✅

### Option B — Manuel

```bash
# 1. Build
pnpm run build

# 2. Commiter le dist/ buildé
git add dist/
git add -A
git commit -m "deploy: mise à jour"
git push
```

Puis dans Plesk : **Deploy Now**.

---

## Structure du dossier `dist/` (commité dans git)

```
dist/
├── index.cjs                 ← Serveur Express + toute l'API (bundle auto-contenu, aucune dépendance)
├── pino-worker.cjs           ← Worker de logs
├── pino-pretty.cjs           ← Formateur de logs
├── pino-file.cjs
├── thread-stream-worker.cjs
├── migrations/               ← Migrations SQL (appliquées au démarrage automatiquement)
│   ├── 0000_panoramic_ares.sql
│   ├── 0001_payment_routing.sql
│   └── meta/
└── public/                   ← Frontend React buildé (servi par Express en production)
    ├── index.html
    ├── assets/               ← JS, CSS, images compilées
    ├── 3d/
    └── logos/
```

---

## Ce qui se passe au démarrage du serveur

Au lancement de `node dist/index.cjs`, automatiquement :
1. Connexion à la base de données via `DATABASE_URL`
2. Migrations SQL appliquées (nouvelles tables uniquement)
3. Serveur HTTP lancé sur `PORT`
4. Frontend React servi depuis `dist/public/`

Aucune étape manuelle.

---

## Commandes utiles

| Commande | Usage |
|---|---|
| `./deploy.sh "msg"` | Build + commit + push en une commande |
| `pnpm run build` | Build seul (API + frontend) |
| `node dist/index.cjs` | Démarrer le serveur (production) |
| `npm start` | Identique à `node dist/index.cjs` |

---

## Dépannage

**Page blanche ?**
→ Vérifier que `NODE_ENV=production` est défini dans Plesk.

**Erreur base de données ?**
→ Vérifier `DATABASE_URL` dans les variables Plesk.

**Port déjà utilisé ?**
→ Changer `PORT=3001` et mettre à jour le reverse proxy Plesk.

**Logs du serveur ?**
→ Plesk → Node.js → Logs
