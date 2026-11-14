# Modèle de menace

## Vue d’ensemble

Simix est une application web React/Vite avec une API Express et une base PostgreSQL
partagée avec l’hébergement Plesk. Les utilisateurs peuvent gérer un portefeuille,
acheter des numéros virtuels et contacter le support. L’API communique avec des
prestataires de paiement, 5sim, des fournisseurs d’IA et d’email, Telegram et le
stockage de fichiers.

## Actifs

- **Comptes et authentifiants** — mots de passe hachés, sessions utilisateur, jetons
  d’administration et codes OTP de vérification ou de réinitialisation.
- **Argent et historique financier** — soldes, recharges, achats, remboursements,
  paiements crypto, retraits et identifiants des prestataires.
- **Données personnelles** — noms, téléphones, emails, adresses IP, historique de
  connexion, messages de support et images jointes.
- **Données d’accès aux services** — SMS reçus, numéros virtuels et informations de
  compte utilisées pour répondre au support.
- **Secrets d’application** — accès PostgreSQL, clés de signature, clés de chiffrement,
  clés de paiement, de messagerie, d’IA et jeton Telegram. Les secrets de production
  doivent rester dans les variables d’environnement Plesk.
- **Disponibilité et intégrité de la plateforme** — capacité à traiter les paiements,
  à créditer les comptes une seule fois et à restituer le solde dû.

## Frontières de confiance

- **Navigateur → API** — toutes les valeurs envoyées par le client sont non fiables.
  L’API doit appliquer les contrôles d’identité, de propriété et de montant côté serveur.
- **API → PostgreSQL/Supabase** — la base contient les comptes et les écritures
  financières. Une erreur d’autorisation ou une écriture non atomique peut exposer des
  données ou désynchroniser le solde et le grand livre.
- **Utilisateur → administrateur** — les routes d’administration utilisent un JWT
  Bearer distinct. Le rôle actif doit être vérifié côté serveur et les privilèges retirés
  doivent invalider les sessions existantes.
- **API → prestataires externes** — les statuts et montants reçus des fournisseurs ne
  sont pas fiables tant qu’ils ne sont pas confirmés par une signature vérifiée ou par
  l’API authentifiée du prestataire.
- **API → IA, email, Telegram et stockage** — des messages, pièces jointes, coordonnées
  ou données de compte peuvent quitter le serveur. Chaque transfert doit respecter le
  périmètre et la rétention décidés pour ces services.
- **Replit → Plesk / base partagée** — l’environnement de développement peut pointer
  vers la base utilisée par Plesk. Les migrations, tests avec écritures et workers de
  production doivent rester désactivés dans l’environnement de développement.
- **Proxy Plesk/Nginx → Express** — l’adresse IP et le protocole transmis par les en-têtes
  proxy ne sont fiables que si le proxy les remplace ou les assainit correctement.

## Repères de sécurité

- Démarrage et déploiement : `startup.js`, `artifacts/api-server/src/index.ts`.
- Middleware global, proxy, CORS et en-têtes : `artifacts/api-server/src/app.ts` et
  `artifacts/api-server/src/middlewares/security.ts`.
- Sessions et authentification : `artifacts/api-server/src/lib/auth.ts`,
  `artifacts/api-server/src/routes/auth.ts`, `forgot-password.ts`,
  `admin-auth.ts` et `admin-jwt-middleware.ts`.
- Portefeuille et règlements : `wallet.ts`, `crypto-wallet.ts`,
  `pawapay-settlement.ts`, `clapay-settlement.ts` et `payout-service.ts`.
- Achats de numéros et remboursements : `numbers.ts` et `fivesim-poller.ts`.
- Support, pièces jointes et stockage : `support.ts`, `lib/telegram.ts` et `storage.ts`.
- Les tests et outils de développement ne sont pas une preuve de sécurité de Plesk.
  Les vérifications de production doivent se faire sur un environnement autorisé et
  isolé des soldes et paiements réels.

## Catégories de menace

### Usurpation

Un attaquant peut tenter de prendre le contrôle d’un compte via la connexion, la
réinitialisation du mot de passe ou un jeton administrateur volé. Les sessions
utilisateur doivent être aléatoires, expirables et révocables. Une réinitialisation
doit exiger une preuve à usage unique, courte durée, liée au compte et consommée
atomiquement avec le changement de mot de passe. Chaque requête administrateur doit
confirmer que le compte existe toujours et possède encore le rôle requis. Les callbacks
doivent être authentifiés ou ne servir que de signal avant une vérification auprès du
prestataire.

### Altération

Les prix, montants, identités de paiement et décisions de crédit ne doivent jamais
dépendre uniquement du client ou du contenu d’un callback. Les recharges et remboursements
doivent vérifier les preuves enregistrées à l’initiation et mettre à jour le grand livre
et le solde dans une même transaction. Toute opération répétée ou concurrente doit rester
idempotente et ne produire ni double crédit ni perte de crédit.

### Répudiation

Les connexions, changements de rôle, paiements, remboursements et actions
administratives doivent produire des traces horodatées liées à l’acteur et à
l’opération. Les journaux ne doivent pas contenir de mots de passe, codes OTP,
jetons d’accès ou clés secrètes; l’échec de Telegram ou de l’email ne doit pas effacer
la preuve financière enregistrée.

### Divulgation d’informations

Les historiques, SMS, soldes, transactions et fichiers doivent être accessibles
uniquement à leur propriétaire ou à un administrateur autorisé. Les réponses d’erreur
ne doivent pas exposer les détails internes de la base. Les contenus de support et
images transmis à Telegram ou aux fournisseurs d’IA constituent un transfert de données
personnelles et peuvent contenir des informations sensibles; leur accès et leur
rétention doivent être limités et documentés.

### Déni de service

La limitation de débit doit survivre aux redémarrages et être cohérente entre les
instances. Les routes publiques coûteuses, notamment le support IA et les téléchargements,
doivent appliquer des quotas adaptés, des limites de taille et une gestion de capacité
de stockage. Les appels sortants doivent avoir des délais maximaux et des limites de
concurrence.

### Élévation de privilèges

Les contrôles d’administration doivent être appliqués côté API, pas seulement dans
l’interface. Toute lecture ou modification de données utilisateur doit vérifier
l’identité du propriétaire à chaque requête. Les requêtes SQL doivent rester
paramétrées et les chemins de fichiers ne doivent jamais être dérivés directement
d’une entrée non validée.
