/**
 * Seed Simix reference data: services, countries, payment methods,
 * API providers (5sim, PawaPay), and a demo user.
 * Target: Supabase (SUPABASE_DATABASE_URL)
 */
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";
import {
  countriesTable,
  paymentMethodsTable,
  servicesTable,
  transactionsTable,
  usersTable,
  apiProvidersTable,
  systemSettingsTable,
  countryPaymentConfigsTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error("SUPABASE_DATABASE_URL must be set.");
}

function parseUrl(raw: string): pg.PoolConfig {
  const p = new URL(raw);
  return {
    host: p.hostname,
    port: Number(p.port) || 6543,
    database: p.pathname.replace(/^\//, ""),
    user: decodeURIComponent(p.username),
    password: decodeURIComponent(p.password),
    ssl: { rejectUnauthorized: false },
  };
}

const pool = new Pool({
  ...parseUrl(process.env.SUPABASE_DATABASE_URL),
  max: 3,
  connectionTimeoutMillis: 15000,
});

const db = drizzle(pool, { schema });

type ServiceSeed = {
  name: string;
  slug: string;
  price: number;
  available: number;
  color: string;
  category: string;
  popular: boolean;
  sortOrder: number;
};

type CountrySeed = {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  available: number;
  price: number;
  popular: boolean;
  sortOrder: number;
};

type PaymentSeed = {
  name: string;
  slug: string;
  description: string;
  color: string;
  recommended: boolean;
  sortOrder: number;
};

type ApiProviderSeed = {
  name: string;
  slug: string;
  apiKey: string;
  baseUrl: string;
  active: boolean;
  priority: number;
  markup: number;
};

const SERVICES: ServiceSeed[] = [
  { name: "WhatsApp", slug: "whatsapp", price: 150, available: 24560, color: "#25D366", category: "Messagerie", popular: true, sortOrder: 10 },
  { name: "Telegram", slug: "telegram", price: 120, available: 18732, color: "#229ED9", category: "Messagerie", popular: true, sortOrder: 20 },
  { name: "Facebook", slug: "facebook", price: 150, available: 12984, color: "#1877F2", category: "Réseaux sociaux", popular: true, sortOrder: 30 },
  { name: "Google", slug: "google", price: 100, available: 8657, color: "#FFFFFF", category: "Comptes", popular: true, sortOrder: 40 },
  { name: "Instagram", slug: "instagram", price: 150, available: 9215, color: "#E1306C", category: "Réseaux sociaux", popular: true, sortOrder: 50 },
  { name: "Twitter / X", slug: "twitter", price: 120, available: 6432, color: "#000000", category: "Réseaux sociaux", popular: true, sortOrder: 60 },
  { name: "TikTok", slug: "tiktok", price: 200, available: 4987, color: "#FF0050", category: "Réseaux sociaux", popular: false, sortOrder: 70 },
  { name: "Snapchat", slug: "snapchat", price: 130, available: 3210, color: "#FFFC00", category: "Messagerie", popular: false, sortOrder: 80 },
  { name: "Discord", slug: "discord", price: 110, available: 5320, color: "#5865F2", category: "Messagerie", popular: false, sortOrder: 90 },
  { name: "Signal", slug: "signal", price: 140, available: 2841, color: "#3A76F0", category: "Messagerie", popular: false, sortOrder: 100 },
  { name: "Apple", slug: "apple", price: 180, available: 1523, color: "#A2AAAD", category: "Comptes", popular: false, sortOrder: 110 },
  { name: "Microsoft", slug: "microsoft", price: 120, available: 2341, color: "#00A4EF", category: "Comptes", popular: false, sortOrder: 120 },
  { name: "LinkedIn", slug: "linkedin", price: 130, available: 3120, color: "#0A66C2", category: "Réseaux sociaux", popular: false, sortOrder: 130 },
  { name: "Uber", slug: "uber", price: 160, available: 2100, color: "#000000", category: "Services", popular: false, sortOrder: 140 },
  { name: "Netflix", slug: "netflix", price: 200, available: 1800, color: "#E50914", category: "Streaming", popular: false, sortOrder: 150 },
  { name: "PayPal", slug: "paypal", price: 200, available: 2500, color: "#003087", category: "Finance", popular: false, sortOrder: 160 },
  { name: "Binance", slug: "binance", price: 180, available: 3200, color: "#F3BA2F", category: "Finance", popular: false, sortOrder: 170 },
  { name: "Steam", slug: "steam", price: 150, available: 1900, color: "#1B2838", category: "Gaming", popular: false, sortOrder: 180 },
];

const COUNTRIES: CountrySeed[] = [
  { name: "États-Unis", code: "US", dialCode: "+1", flag: "🇺🇸", available: 24560, price: 150, popular: true, sortOrder: 10 },
  { name: "Royaume-Uni", code: "GB", dialCode: "+44", flag: "🇬🇧", available: 18732, price: 200, popular: true, sortOrder: 20 },
  { name: "France", code: "FR", dialCode: "+33", flag: "🇫🇷", available: 12984, price: 150, popular: true, sortOrder: 30 },
  { name: "Canada", code: "CA", dialCode: "+1", flag: "🇨🇦", available: 8657, price: 150, popular: true, sortOrder: 40 },
  { name: "Côte d'Ivoire", code: "CI", dialCode: "+225", flag: "🇨🇮", available: 6432, price: 150, popular: true, sortOrder: 50 },
  { name: "Allemagne", code: "DE", dialCode: "+49", flag: "🇩🇪", available: 9215, price: 150, popular: true, sortOrder: 60 },
  { name: "Pays-Bas", code: "NL", dialCode: "+31", flag: "🇳🇱", available: 6432, price: 150, popular: false, sortOrder: 70 },
  { name: "Suède", code: "SE", dialCode: "+46", flag: "🇸🇪", available: 4987, price: 150, popular: false, sortOrder: 80 },
  { name: "Belgique", code: "BE", dialCode: "+32", flag: "🇧🇪", available: 4567, price: 150, popular: false, sortOrder: 90 },
  { name: "Espagne", code: "ES", dialCode: "+34", flag: "🇪🇸", available: 7123, price: 150, popular: false, sortOrder: 100 },
  { name: "Italie", code: "IT", dialCode: "+39", flag: "🇮🇹", available: 6034, price: 150, popular: false, sortOrder: 110 },
  { name: "Sénégal", code: "SN", dialCode: "+221", flag: "🇸🇳", available: 3245, price: 130, popular: false, sortOrder: 120 },
  { name: "Mali", code: "ML", dialCode: "+223", flag: "🇲🇱", available: 1842, price: 130, popular: false, sortOrder: 130 },
  { name: "Burkina Faso", code: "BF", dialCode: "+226", flag: "🇧🇫", available: 1523, price: 130, popular: false, sortOrder: 140 },
  { name: "Maroc", code: "MA", dialCode: "+212", flag: "🇲🇦", available: 5621, price: 140, popular: false, sortOrder: 150 },
  { name: "Inde", code: "IN", dialCode: "+91", flag: "🇮🇳", available: 28412, price: 100, popular: false, sortOrder: 160 },
  { name: "Brésil", code: "BR", dialCode: "+55", flag: "🇧🇷", available: 14523, price: 130, popular: false, sortOrder: 170 },
  { name: "Mexique", code: "MX", dialCode: "+52", flag: "🇲🇽", available: 9842, price: 130, popular: false, sortOrder: 180 },
  { name: "Australie", code: "AU", dialCode: "+61", flag: "🇦🇺", available: 4231, price: 200, popular: false, sortOrder: 190 },
  { name: "Nigéria", code: "NG", dialCode: "+234", flag: "🇳🇬", available: 8200, price: 120, popular: false, sortOrder: 200 },
  { name: "Ghana", code: "GH", dialCode: "+233", flag: "🇬🇭", available: 4300, price: 120, popular: false, sortOrder: 210 },
  { name: "Cameroun", code: "CM", dialCode: "+237", flag: "🇨🇲", available: 2800, price: 130, popular: false, sortOrder: 220 },
  { name: "Russie", code: "RU", dialCode: "+7", flag: "🇷🇺", available: 35000, price: 90, popular: false, sortOrder: 230 },
  { name: "Ukraine", code: "UA", dialCode: "+380", flag: "🇺🇦", available: 12000, price: 100, popular: false, sortOrder: 240 },
  { name: "Togo", code: "TG", dialCode: "+228", flag: "🇹🇬", available: 1200, price: 130, popular: false, sortOrder: 250 },
  { name: "Bénin", code: "BJ", dialCode: "+229", flag: "🇧🇯", available: 980, price: 130, popular: false, sortOrder: 260 },
];

const PAYMENT_METHODS: PaymentSeed[] = [
  { name: "Orange Money", slug: "orange_money", description: "Orange CI, SN, ML, BF", color: "#FF7A00", recommended: true, sortOrder: 10 },
  { name: "MTN Mobile Money", slug: "mtn_money", description: "MTN CI, GH, CM, NG", color: "#FFCC00", recommended: true, sortOrder: 20 },
  { name: "Wave", slug: "wave", description: "Wave CI, SN", color: "#1AC9FF", recommended: true, sortOrder: 30 },
  { name: "Moov Money", slug: "moov_money", description: "Moov CI, BJ, TG, BF", color: "#0066CC", recommended: false, sortOrder: 40 },
  { name: "Airtel Money", slug: "airtel_money", description: "Airtel NG, KE, TZ, UG", color: "#FF0000", recommended: false, sortOrder: 50 },
  { name: "M-Pesa", slug: "mpesa", description: "M-Pesa KE, TZ, MZ", color: "#4CAF50", recommended: false, sortOrder: 60 },
];

const API_PROVIDERS: ApiProviderSeed[] = [
  {
    name: "5sim",
    slug: "5sim",
    apiKey: "",
    baseUrl: "https://5sim.net/v1",
    active: false,
    priority: 1,
    markup: 20,
  },
  {
    name: "PawaPay",
    slug: "pawapay",
    apiKey: "",
    baseUrl: "https://api.pawapay.io",
    active: false,
    priority: 2,
    markup: 0,
  },
];

const COUNTRY_PAYMENT_CONFIGS: Array<{ countryCode: string; methodSlug: string; minDeposit: number; feePercent: number }> = [
  { countryCode: "CI", methodSlug: "orange_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "CI", methodSlug: "mtn_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "CI", methodSlug: "wave", minDeposit: 500, feePercent: 0 },
  { countryCode: "CI", methodSlug: "moov_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "SN", methodSlug: "orange_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "SN", methodSlug: "wave", minDeposit: 500, feePercent: 0 },
  { countryCode: "ML", methodSlug: "orange_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "BF", methodSlug: "orange_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "BF", methodSlug: "moov_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "TG", methodSlug: "moov_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "BJ", methodSlug: "mtn_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "BJ", methodSlug: "moov_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "GH", methodSlug: "mtn_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "CM", methodSlug: "mtn_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "NG", methodSlug: "mtn_money", minDeposit: 500, feePercent: 0 },
  { countryCode: "NG", methodSlug: "airtel_money", minDeposit: 500, feePercent: 0 },
];

async function upsertServices() {
  console.log("→ Seeding services...");
  for (const s of SERVICES) {
    await db.insert(servicesTable).values(s).onConflictDoUpdate({
      target: servicesTable.slug,
      set: { name: s.name, price: s.price, available: s.available, color: s.color, category: s.category, popular: s.popular, sortOrder: s.sortOrder },
    });
  }
  console.log(`  ✓ ${SERVICES.length} services`);
}

async function upsertCountries() {
  console.log("→ Seeding countries...");
  for (const c of COUNTRIES) {
    await db.insert(countriesTable).values(c).onConflictDoUpdate({
      target: countriesTable.code,
      set: { name: c.name, dialCode: c.dialCode, flag: c.flag, available: c.available, price: c.price, popular: c.popular, sortOrder: c.sortOrder },
    });
  }
  console.log(`  ✓ ${COUNTRIES.length} countries`);
}

async function upsertPaymentMethods() {
  console.log("→ Seeding payment methods...");
  for (const pm of PAYMENT_METHODS) {
    await db.insert(paymentMethodsTable).values(pm).onConflictDoUpdate({
      target: paymentMethodsTable.slug,
      set: { name: pm.name, description: pm.description, color: pm.color, recommended: pm.recommended, sortOrder: pm.sortOrder },
    });
  }
  console.log(`  ✓ ${PAYMENT_METHODS.length} payment methods`);
}

async function upsertApiProviders() {
  console.log("→ Seeding API providers...");
  for (const p of API_PROVIDERS) {
    const existing = await db.select().from(apiProvidersTable).where(eq(apiProvidersTable.slug, p.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(apiProvidersTable).values(p);
      console.log(`  + Created provider: ${p.name} (inactive — add API key via admin panel)`);
    } else {
      await db.update(apiProvidersTable).set({
        name: p.name,
        baseUrl: p.baseUrl,
        priority: p.priority,
        markup: p.markup,
      }).where(eq(apiProvidersTable.slug, p.slug));
      console.log(`  ✓ Updated provider: ${p.name} (API key preserved)`);
    }
  }
}

async function upsertCountryPaymentConfigs() {
  console.log("→ Seeding country payment configs...");
  for (const cfg of COUNTRY_PAYMENT_CONFIGS) {
    await db.insert(countryPaymentConfigsTable).values({ ...cfg, enabled: true }).onConflictDoUpdate({
      target: [countryPaymentConfigsTable.countryCode, countryPaymentConfigsTable.methodSlug],
      set: { enabled: true, minDeposit: cfg.minDeposit, feePercent: cfg.feePercent },
    });
  }
  console.log(`  ✓ ${COUNTRY_PAYMENT_CONFIGS.length} payment configs`);
}

async function upsertSystemSettings() {
  console.log("→ Seeding system settings...");
  const settings = [
    { key: "pawapay_env", value: "sandbox" },
    { key: "maintenance_mode", value: "false" },
    { key: "min_recharge_amount", value: "500" },
    { key: "max_recharge_amount", value: "500000" },
  ];
  for (const s of settings) {
    await db.insert(systemSettingsTable).values(s).onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: s.value },
    });
  }
  console.log(`  ✓ ${settings.length} system settings`);
}

async function ensureDemoUser() {
  console.log("→ Seeding demo user...");
  const phone = "+2250701234567";
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing) {
    await db.update(usersTable).set({ balance: sql`GREATEST(${usersTable.balance}, 12450)` }).where(eq(usersTable.id, existing.id));
    console.log("  ✓ Demo user already exists (balance updated)");
    return existing.id;
  }
  const passwordHash = await bcrypt.hash("simix2026", 10);
  const [user] = await db.insert(usersTable).values({
    fullName: "Kouassi David",
    phone,
    countryCode: "+225",
    username: "kouassi_david",
    email: "kouassidavid@gmail.com",
    passwordHash,
    balance: 12_450,
    verified: true,
    status: "Standard",
  }).returning();
  if (!user) return null;

  const seedTx = [
    { type: "recharge", amount: 5000, method: "Orange Money", description: "Recharge Orange Money" },
    { type: "purchase", amount: 150, method: "wallet", description: "Numéro WhatsApp - Côte d'Ivoire" },
    { type: "recharge", amount: 10000, method: "MTN Mobile Money", description: "Recharge MTN" },
  ] as const;
  for (const t of seedTx) {
    await db.insert(transactionsTable).values({ userId: user.id, type: t.type, amount: t.amount, status: "completed", method: t.method, description: t.description });
  }
  console.log("  ✓ Demo user created");
  return user.id;
}

async function main() {
  console.log("🚀 Seeding Supabase database...\n");

  const client = await pool.connect();
  await client.query("SELECT 1");
  client.release();
  console.log("  ✓ Database connection verified\n");

  await upsertServices();
  await upsertCountries();
  await upsertPaymentMethods();
  await upsertApiProviders();
  await upsertCountryPaymentConfigs();
  await upsertSystemSettings();
  await ensureDemoUser();
  console.log("\n✅ Seed completed successfully!");
  console.log("\n📝 Next steps:");
  console.log("  1. Add your 5sim API key via the admin panel → Fournisseurs → 5sim → Modifier");
  console.log("  2. Add your PawaPay token via l'admin → Fournisseurs → PawaPay → Modifier");
  console.log("  3. Activer les fournisseurs après avoir ajouté les clés");
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  await pool.end();
  process.exit(1);
});
