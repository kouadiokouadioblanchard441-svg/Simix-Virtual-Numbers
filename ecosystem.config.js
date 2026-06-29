module.exports = {
  apps: [
    {
      name: 'simix',
      script: 'dist/index.cjs',
      node_args: '--enable-source-maps',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,

        // ── Base de données ──────────────────────────────────────────────
        SUPABASE_DATABASE_URL: 'postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',

        // ── Administration ───────────────────────────────────────────────
        ADMIN_ACCESS_TOKEN: 'REMPLACER_PAR_TOKEN_ADMIN',
        ADMIN_JWT_SECRET: 'REMPLACER_PAR_SECRET_JWT',

        // ── Fournisseur de numéros virtuels (5sim) ───────────────────────
        FIVESIM_API_KEY: 'REMPLACER_PAR_CLE_5SIM',

        // ── Passerelles de paiement ──────────────────────────────────────
        PAWAPAY_API_TOKEN: 'REMPLACER_PAR_TOKEN_PAWAPAY',
        PAWAPAY_ENV: 'production',           // 'production' ou 'sandbox'
        CLAPAY_API_TOKEN: 'REMPLACER_PAR_TOKEN_CLAPAY',
        MOBILE_MONEY_GATEWAY: 'pawapay',     // 'pawapay' ou 'clapay'

        // ── Email (Resend) ────────────────────────────────────────────────
        RESEND_API_KEY: 'REMPLACER_PAR_CLE_RESEND',

        // ── Connexion Google OAuth ────────────────────────────────────────
        GOOGLE_CLIENT_ID: 'REMPLACER_PAR_CLIENT_ID_GOOGLE',
        GOOGLE_CLIENT_SECRET: 'REMPLACER_PAR_SECRET_GOOGLE',
        GOOGLE_REDIRECT_URI: 'https://VOTRE_DOMAINE.com/api/auth/google/callback',

        // ── URL publique de l'application ────────────────────────────────
        APP_URL: 'https://VOTRE_DOMAINE.com',
      },
    },
  ],
};
