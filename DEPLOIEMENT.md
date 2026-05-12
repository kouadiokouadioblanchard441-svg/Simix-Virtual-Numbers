# Déploiement Plesk — Simix

## Workflow simplifié

```
Replit (développement)  →  git push  →  GitHub  →  Plesk : git pull + Deploy Now
```

**Aucun build nécessaire dans Plesk.** Le dossier `dist/` est versionné dans git.

---

## Configuration initiale dans Plesk (une seule fois)

### 1. Node.js App Settings

| Paramètre | Valeur |
|---|---|
| **Application root** | `/` (racine du repo) |
| **Application startup file** | `dist/index.cjs` |
| **Node.js version** | `20.x` ou supérieur |
| **Application mode** | `production` |

### 2. Variables d'environnement

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

> Les clés IA (Gemini, OpenAI) se configurent directement depuis le **panel admin → Support IA → Configuration IA**, pas besoin de les mettre ici.

### 3. Domaine & Proxy

Configurez un reverse proxy dans Plesk depuis votre domaine vers `localhost:3000`.

---

## Workflow de mise à jour (quotidien)

1. Développez sur **Replit**
2. Depuis Replit, lancez le build complet :
   ```
   pnpm run build
   ```
3. **Commitez et poussez** vers GitHub (le dossier `dist/` est inclus automatiquement)
4. Dans **Plesk** : `Git → Pull → Deploy Now`
5. ✅ Votre site est mis à jour — sans aucun build dans Plesk

---

## Structure du dossier `dist/` (versionné dans git)

```
dist/
├── index.cjs          ← API + serveur Express (bundle complet)
├── pino-worker.cjs    ← Worker de logs
├── pino-pretty.cjs    ← Formateur de logs
├── migrations/        ← Migrations SQL (appliquées au démarrage)
└── public/            ← Frontend React buildé (servi en production)
    ├── index.html
    ├── assets/
    └── 3d/            ← Icônes et images 3D
```

---

## Commandes utiles

| Commande | Usage |
|---|---|
| `node dist/index.cjs` | Démarrer le serveur (production) |
| `pnpm run build` | Rebuilder API + frontend (dans Replit) |
| `pnpm run start` | Équivalent `node dist/index.cjs` |

---

## Dépannage

**Le site affiche une page blanche ?**
→ Vérifier que `NODE_ENV=production` est bien défini dans Plesk.

**Erreur de connexion à la base de données ?**
→ Vérifier `DATABASE_URL` dans les variables d'environnement Plesk.

**Port déjà utilisé ?**
→ Changer `PORT=3001` (et mettre à jour le proxy Plesk).

**Comment voir les logs ?**
→ Dans Plesk → Node.js → Logs, ou sur le serveur : `pm2 logs` si PM2 est utilisé.
