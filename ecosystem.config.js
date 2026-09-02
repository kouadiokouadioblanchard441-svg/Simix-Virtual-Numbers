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
        SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL || '',

        // ── Administration ───────────────────────────────────────────────
        ADMIN_ACCESS_TOKEN: process.env.ADMIN_ACCESS_TOKEN || '',
        ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || '',

        // ── Fournisseur de numéros virtuels (5sim) ───────────────────────
        FIVESIM_API_KEY: process.env.FIVESIM_API_KEY || '',

        // ── Passerelles de paiement ──────────────────────────────────────
        PAWAPAY_API_TOKEN: process.env.PAWAPAY_API_TOKEN || '',
        PAWAPAY_ENV: 'production',           // 'production' ou 'sandbox'
        CLAPAY_API_TOKEN: process.env.CLAPAY_API_TOKEN || '',
        MOBILE_MONEY_GATEWAY: 'pawapay',     // 'pawapay' ou 'clapay'

        // ── Email (Resend) ────────────────────────────────────────────────
        RESEND_API_KEY: process.env.RESEND_API_KEY || '',

        // ── Connexion Google OAuth ────────────────────────────────────────
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
        GOOGLE_REDIRECT_URI: 'https://www.simix.site/api/auth/google/callback',

        // ── URL publique de l'application ────────────────────────────────
        APP_URL: 'https://www.simix.site',
      },
    },
  ],
};
