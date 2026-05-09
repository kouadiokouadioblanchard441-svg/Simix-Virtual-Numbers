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
const PASSWORD = "Simix@Admin2026";
const NAME     = "Administrateur Simix";
const USERNAME = "admin_simix";
const EMAIL    = "admin@simix.app";

console.log("⏳ Hashage du mot de passe...");
const hash = await bcrypt.hash(PASSWORD, 12);

/* Supprimer si déjà existant */
await client.query("DELETE FROM users WHERE phone = $1 OR email = $2", [PHONE, EMAIL]);

const { rows } = await client.query(`
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
  ) RETURNING id, phone, username, email, is_admin, balance, status
`, [NAME, USERNAME, PHONE, EMAIL, hash]);

console.log("\n✅ Compte administrateur créé dans Supabase !\n");
console.log("═══════════════════════════════════════════════════");
console.log("  📱 Téléphone  : " + PHONE);
console.log("  🔑 Mot de passe : " + PASSWORD);
console.log("  👤 Nom        : " + NAME);
console.log("  📧 Email      : " + EMAIL);
console.log("  🛡️  Admin      : true");
console.log("  💰 Solde      : 1 000 000 FCFA");
console.log("═══════════════════════════════════════════════════");
console.log("\nEnregistrement DB :", JSON.stringify(rows[0], null, 2));

await client.end();
