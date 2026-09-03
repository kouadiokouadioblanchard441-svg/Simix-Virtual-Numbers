# Déploiement Plesk — Simix

## Workflow quotidien (après configuration initiale)

```
Replit → ./deploy.sh "message"  →  GitHub  →  Plesk : Deploy Now  →  ✅ Live
```

Le dépôt contient les fichiers compilés pour un démarrage immédiat. `startup.js` peut aussi
reconstruire automatiquement le backend et le frontend après une mise à jour des sources.

---

## Configuration initiale dans Plesk (une seule fois)

### 1. Node.js App Settings

| Paramètre | Valeur |
|---|---|
| **Application root** | `/` (racine du repo) |
| **Application startup file** | `startup.js` |
| **Node.js version** | `20.x` ou supérieur |
| **Application mode** | `production` |

> ⚠️ **Le démarrage standard est `startup.js`.** Une étape de build Plesk séparée
> n'est pas nécessaire : le point d'entrée vérifie lui-même si le bundle doit être reconstruit.

---

### 2. Variables d'environnement Plesk

Définir dans **Plesk → Node.js → Environment Variables**.

#### Obligatoires

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/simix
SESSION_SECRET=<64 octets aléatoires en base64>
ADMIN_ACCESS_TOKEN=<48 octets hex — clé d'accès à l'URL admin>
ADMIN_JWT_SECRET=<64 octets hex — signature des sessions admin>
ENCRYPTION_KEY=<clé stable identique à celle de Replit pour chiffrer les identifiants fournisseurs>
```

#### Fournisseur de numéros

```
FIVESIM_API_KEY=<votre clé API 5sim.net>
```

#### Paiements mobile money

```
PAWAPAY_API_TOKEN=<votre token PawaPay>
PAWAPAY_ENV=production
MOBILE_MONEY_GATEWAY=pawapay
```

> Les identifiants Clapay (si utilisé) se configurent depuis **Admin → Routage des paiements → Passerelles**.

#### Emails transactionnels

```
RESEND_API_KEY=<votre clé Resend>
EMAIL_FROM=noreply@votredomaine.com
```

> La base Supabase est la source de vérité pour les identifiants, l'activation et
> la priorité des fournisseurs email. `RESEND_API_KEY`/`BREVO_API_KEY` dans Plesk
> servent uniquement d'amorçage si la ligne correspondante n'a pas encore de clé
> en base. Tous les environnements qui partagent la base doivent utiliser la même
> `ENCRYPTION_KEY`.

#### Application

```
APP_URL=https://votredomaine.com
LOG_LEVEL=info
```

#### Optionnels (Google OAuth)

```
GOOGLE_CLIENT_ID=<votre client ID Google>
GOOGLE_CLIENT_SECRET=<votre client secret Google>
GOOGLE_REDIRECT_URI=https://votredomaine.com/api/auth/google/callback
```

---

#### Générer les secrets sécurisés

```bash
# SESSION_SECRET (64 octets base64)
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# ADMIN_ACCESS_TOKEN (48 octets hex)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ADMIN_JWT_SECRET (64 octets hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> **Note :** Les clés des passerelles de paiement supplémentaires (Clapay, etc.) et les clés IA (OpenAI, Gemini) se configurent directement depuis le **panel admin** → Fournisseurs / Support IA. Pas besoin de les mettre dans les variables d'environnement.

---

### 3. Git déploiement dans Plesk

Dans **Plesk → Domaine → Git** :
1. Coller l'URL du dépôt GitHub
2. Sélectionner la branche `main`
3. **Actions de déploiement** — laisser vide (Plesk utilise `npm start` → `node startup.js`)

### 4. Reverse Proxy

Configurer un proxy dans Plesk depuis votre domaine → `localhost:3000`.

### 5. En-têtes de sécurité nginx (obligatoire pour le score A)

> **Pourquoi ?** Plesk/nginx sert le fichier `index.html` statique directement, sans passer par l'app Node.js. Les en-têtes helmet configurés dans Express ne s'appliquent donc pas à cette réponse. Il faut les ajouter au niveau nginx.

Dans **Plesk → Domains → simix.site → Apache & nginx Settings → Additional nginx directives**, coller :

```nginx
# HSTS — force HTTPS 1 an
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Anti-clickjacking
add_header X-Frame-Options "SAMEORIGIN" always;

# Anti-MIME-sniffing
add_header X-Content-Type-Options "nosniff" always;

# Politique de référent
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Content Security Policy
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; script-src-elem 'self' https://challenges.cloudflare.com; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' wss: ws: https:; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; child-src 'self' blob: https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" always;

# Permissions Policy
add_header Permissions-Policy "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(), usb=(), web-share=(), xr-spatial-tracking=()" always;

# Masquer la version nginx
server_tokens off;
```

> Le même bloc se trouve dans `nginx-security-headers.conf` à la racine du dépôt.
> Après avoir collé ces directives, cliquer sur **OK** puis redémarrer nginx dans Plesk.

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
├── index.cjs                          ← Serveur Express + toute l'API (bundle auto-contenu)
├── pino-worker.cjs                    ← Worker de logs asynchrones
├── pino-pretty.cjs                    ← Formateur de logs lisibles
├── pino-file.cjs                      ← Logs vers fichier
├── thread-stream-worker.cjs           ← Worker de threads pour Pino
├── migrations/                        ← Migrations SQL (appliquées au démarrage)
│   ├── 0000_panoramic_ares.sql        ← Schéma initial (toutes les tables de base)
│   ├── 0001_payment_routing.sql       ← Routage des paiements
│   ├── 0002_services_logo_url.sql     ← Logo URL des services
│   ├── 0003_missing_tables.sql        ← Tables manquantes (notifications, etc.)
│   ├── 0004_missing_tables_2.sql      ← Tables manquantes (bannières, campagnes)
│   ├── 0005_users_missing_columns.sql ← Colonnes manquantes sur users
│   ├── 0006_service_country_availability.sql ← Disponibilité service/pays
│   ├── 0007_country_enabled_flags.sql ← Flags d'activation des pays
│   ├── 0008_referral_columns.sql      ← Système de parrainage
│   ├── 0009_transactions_gateway_meta.sql ← Métadonnées des transactions
│   └── meta/                          ← Métadonnées Drizzle (ne pas modifier)
```

Le frontend React est généré séparément dans `public/` à la racine du projet.

---

## Ce qui se passe au démarrage du serveur

Au lancement de `node startup.js`, le bundle est vérifié/reconstruit si nécessaire,
puis `dist/index.cjs` démarre automatiquement les services dans cet ordre :

1. Connexion à la base de données via `DATABASE_URL`
2. Migrations SQL appliquées (nouvelles tables uniquement, idempotent)
3. Serveur HTTP lancé sur `PORT` (défaut : `3000`)
4. Seeding des méthodes de paiement (Orange Money, MTN, Wave…)
5. Seeding du routage de paiement
6. Synchronisation des pays 5sim (si clé configurée)
7. Démarrage du poller SMS 5sim (intervalle : 15s)
8. Démarrage de la réconciliation PawaPay (intervalle : 30s)
9. Démarrage de la réconciliation Clapay (intervalle : 5min)
10. Frontend React servi depuis `public/`

**Aucune étape manuelle nécessaire.**

---

## Accès au panel d'administration

```
https://votredomaine.com/admin
```

L'accès admin requiert **deux étapes** de sécurité :
1. Saisie du `ADMIN_ACCESS_TOKEN` (clé URL secrète)
2. Connexion avec identifiants admin (email + mot de passe)
3. Une session JWT valide 24h est alors créée

> Le compte admin par défaut est créé via : `pnpm --filter @workspace/scripts run seed`

---

## Commandes utiles

| Commande | Usage |
|---|---|
| `./deploy.sh "msg"` | Build + commit + push en une commande |
| `pnpm run build` | Build complet (API + frontend) |
| `pnpm --filter @workspace/db run push` | Appliquer les changements de schéma DB |
| `pnpm --filter @workspace/scripts run seed` | Remettre les données de démonstration |
| `pnpm --filter @workspace/api-spec run codegen` | Regénérer les hooks API après modification de openapi.yaml |
| `node dist/index.cjs` | Démarrer le serveur (production) |
| `npm start` | Lance `startup.js`, qui charge `dist/index.cjs` |

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Page blanche | `NODE_ENV` non défini ou frontend non buildé | Vérifier `NODE_ENV=production` + que `public/index.html` existe |
| Erreur base de données | `DATABASE_URL` incorrect | Vérifier la chaîne de connexion PostgreSQL |
| Port déjà utilisé | Un autre processus utilise le port | Changer `PORT=3001` et mettre à jour le reverse proxy |
| `Admin JWT signing failed` | `ADMIN_JWT_SECRET` non défini | Ajouter `ADMIN_JWT_SECRET` dans les variables Plesk |
| Impossible d'accéder à /admin | `ADMIN_ACCESS_TOKEN` non défini | Ajouter `ADMIN_ACCESS_TOKEN` dans les variables Plesk |
| Pas de numéros disponibles | Clé 5sim non configurée ou solde insuffisant | Vérifier `FIVESIM_API_KEY` + solde sur 5sim.net |
| Paiements ne fonctionnent pas | Token PawaPay manquant ou invalide | Vérifier `PAWAPAY_API_TOKEN` et `PAWAPAY_ENV` |
| Emails OTP non reçus | Clé Resend manquante | Vérifier `RESEND_API_KEY` et `EMAIL_FROM` |
| Logs du serveur | Accès aux logs | Plesk → Node.js → Logs |
