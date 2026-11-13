import { createRequire } from "module";
const require = createRequire(import.meta.url);

const bcrypt = require("/home/runner/workspace/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs/index.js");
const { Client } = require("/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js");

const dbUrl = process.env.SUPABASE_DATABASE_URL;
if (!dbUrl) { console.error("SUPABASE_DATABASE_URL non défini"); process.exit(1); }

const parsed = new URL(dbUrl);
const client = new Client({
  host: parsed.hostname,
  port: Number(parsed.port) || 5432,
  database: parsed.pathname.replace(/^\//, ""),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const PHONE    = "+2250000000001";
const PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;
const NAME     = "Administrateur Simix";
const USERNAME = "admin_simix";
const EMAIL    = "admin@simix.app";

if (!PASSWORD || PASSWORD.length < 16) {
  console.error("ADMIN_INITIAL_PASSWORD doit être configuré dans les Secrets et contenir au moins 16 caractères.");
  await client.end();
  process.exit(1);
}

console.log("⏳ Hashage du mot de passe...");
const hash = await bcrypt.hash(PASSWORD, 12);

/* Never overwrite an existing account or its wallet balance. */
const existingAccount = await client.query(
  "SELECT id FROM users WHERE phone = $1 OR email = $2 LIMIT 1",
  [PHONE, EMAIL],
);
if (existingAccount.rowCount > 0) {
  console.error("Un compte existe déjà avec ces coordonnées; aucune donnée n'a été modifiée.");
  await client.end();
  process.exit(1);
}

await client.query(`
  INSERT INTO users (
    id, full_name, username, phone, email, country_code,
    password_hash, auth_provider, balance, verified,
    status, is_admin, is_restricted, risk_score,
    max_purchases_per_min, max_balance, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), $1, $2, $3, $4, '+225',
    $5, 'local', 1000000, true,
    'Premium', true, false, 0,
    100, 9999999, NOW(), NOW()
  )
`, [NAME, USERNAME, PHONE, EMAIL, hash]);

console.log("\n✅ Compte administrateur créé dans Supabase !\n");
console.log("Le compte a été créé sans afficher ses données personnelles ni son mot de passe.");

await client.end();
