# Simix — Déploiement Plesk

Guide pour déployer Simix sur un serveur Plesk avec Node.js.

## Prérequis

- Node.js **≥ 20** (paramétré dans Plesk → Node.js)
- PostgreSQL accessible (URL de connexion)
- Variables d'environnement configurées dans Plesk

## Étapes

### 1. Cloner le dépôt

```bash
git clone https://github.com/VOTRE_REPO/simix.git /var/www/simix
```

### 2. Configurer l'application Node.js dans Plesk

| Paramètre              | Valeur                  |
|------------------------|-------------------------|
| Document Root          | `dist/public`           |
| Application Root       | `/var/www/simix`        |
| Application Startup File | `dist/index.cjs`     |
| Application Mode       | `production`            |
| Node.js version        | `20.x` ou plus récent   |

### 3. Variables d'environnement (Plesk → Node.js → Environment Variables)

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/simix
SESSION_SECRET=<64 octets aléatoires>
ADMIN_ACCESS_TOKEN=<48 octets hex>
ADMIN_JWT_SECRET=<64 octets hex>
FIVESIM_API_KEY=<votre clé 5sim>
PAWAPAY_API_TOKEN=<votre token PawaPay>
PAWAPAY_ENV=production
APP_URL=https://votredomaine.com
```

Générer les secrets :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"      # ADMIN_ACCESS_TOKEN
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"      # ADMIN_JWT_SECRET
```

### 4. Premier démarrage

Plesk démarre automatiquement `node dist/index.cjs`.

Au premier démarrage, le serveur :
- Exécute les migrations de la base de données automatiquement
- Synchronise les pays et services depuis l'API 5sim
- Crée les méthodes de paiement (Orange Money, MTN, Wave, etc.)
- Configure le provider 5sim depuis `FIVESIM_API_KEY`

**Aucune commande manuelle nécessaire.**

### 5. Mise à jour (déploiement continu)

```bash
cd /var/www/simix && git pull
# Puis redémarrer l'application depuis Plesk
```

Le `dist/` est versionné — aucun build nécessaire sur le serveur.

## Panneau d'administration

URL : `https://votredomaine.com/admin?token=ADMIN_ACCESS_TOKEN`

Depuis l'admin :
- Configurer PawaPay (token, environnement)
- Gérer les utilisateurs, recharges, litiges
- Activer/désactiver les méthodes de paiement

## Dépannage

| Erreur                          | Solution                                         |
|---------------------------------|--------------------------------------------------|
| `relation "users" already exists` | Normal — les migrations ignorent les tables existantes |
| `ECONNREFUSED` au démarrage     | Vérifier `DATABASE_URL`                         |
| Page blanche                    | Vérifier que `dist/public/index.html` existe    |
| API 401 sur `/api/...`          | Cookie de session expiré — se reconnecter      |
