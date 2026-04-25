/**
 * Seed Simix reference data: services, countries, payment methods, and a
 * demo user with a small starting balance and sample history.
 */
import bcrypt from "bcryptjs";
import {
  db,
  countriesTable,
  paymentMethodsTable,
  servicesTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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

const SERVICES: ServiceSeed[] = [
  {
    name: "WhatsApp",
    slug: "whatsapp",
    price: 150,
    available: 24560,
    color: "#25D366",
    category: "Messagerie",
    popular: true,
    sortOrder: 10,
  },
  {
    name: "Telegram",
    slug: "telegram",
    price: 120,
    available: 18732,
    color: "#229ED9",
    category: "Messagerie",
    popular: true,
    sortOrder: 20,
  },
  {
    name: "Facebook",
    slug: "facebook",
    price: 150,
    available: 12984,
    color: "#1877F2",
    category: "Réseaux sociaux",
    popular: true,
    sortOrder: 30,
  },
  {
    name: "Google",
    slug: "google",
    price: 100,
    available: 8657,
    color: "#FFFFFF",
    category: "Comptes",
    popular: true,
    sortOrder: 40,
  },
  {
    name: "Instagram",
    slug: "instagram",
    price: 150,
    available: 9215,
    color: "#E1306C",
    category: "Réseaux sociaux",
    popular: true,
    sortOrder: 50,
  },
  {
    name: "Twitter / X",
    slug: "twitter",
    price: 120,
    available: 6432,
    color: "#000000",
    category: "Réseaux sociaux",
    popular: true,
    sortOrder: 60,
  },
  {
    name: "TikTok",
    slug: "tiktok",
    price: 200,
    available: 4987,
    color: "#FF0050",
    category: "Réseaux sociaux",
    popular: false,
    sortOrder: 70,
  },
  {
    name: "Snapchat",
    slug: "snapchat",
    price: 130,
    available: 3210,
    color: "#FFFC00",
    category: "Messagerie",
    popular: false,
    sortOrder: 80,
  },
  {
    name: "Discord",
    slug: "discord",
    price: 110,
    available: 5320,
    color: "#5865F2",
    category: "Messagerie",
    popular: false,
    sortOrder: 90,
  },
  {
    name: "Signal",
    slug: "signal",
    price: 140,
    available: 2841,
    color: "#3A76F0",
    category: "Messagerie",
    popular: false,
    sortOrder: 100,
  },
  {
    name: "Apple",
    slug: "apple",
    price: 180,
    available: 1523,
    color: "#A2AAAD",
    category: "Comptes",
    popular: false,
    sortOrder: 110,
  },
  {
    name: "Microsoft",
    slug: "microsoft",
    price: 120,
    available: 2341,
    color: "#00A4EF",
    category: "Comptes",
    popular: false,
    sortOrder: 120,
  },
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
  { name: "Japon", code: "JP", dialCode: "+81", flag: "🇯🇵", available: 3128, price: 220, popular: false, sortOrder: 200 },
];

const PAYMENT_METHODS: PaymentSeed[] = [
  {
    name: "Mobile Money",
    slug: "mobile_money",
    description: "Rapide & sécurisé",
    color: "#7C3AED",
    recommended: true,
    sortOrder: 10,
  },
  {
    name: "Carte bancaire",
    slug: "card",
    description: "Visa, Mastercard",
    color: "#3B82F6",
    recommended: false,
    sortOrder: 20,
  },
  {
    name: "Transfert bancaire",
    slug: "bank_transfer",
    description: "Virement direct",
    color: "#10B981",
    recommended: false,
    sortOrder: 30,
  },
  {
    name: "Orange Money",
    slug: "orange_money",
    description: "Orange CI",
    color: "#FF7A00",
    recommended: false,
    sortOrder: 40,
  },
  {
    name: "MTN Money",
    slug: "mtn_money",
    description: "MTN CI",
    color: "#FFCC00",
    recommended: false,
    sortOrder: 50,
  },
];

async function upsertServices() {
  for (const s of SERVICES) {
    await db
      .insert(servicesTable)
      .values(s)
      .onConflictDoUpdate({
        target: servicesTable.slug,
        set: {
          name: s.name,
          price: s.price,
          available: s.available,
          color: s.color,
          category: s.category,
          popular: s.popular,
          sortOrder: s.sortOrder,
        },
      });
  }
}

async function upsertCountries() {
  for (const c of COUNTRIES) {
    await db
      .insert(countriesTable)
      .values(c)
      .onConflictDoUpdate({
        target: countriesTable.code,
        set: {
          name: c.name,
          dialCode: c.dialCode,
          flag: c.flag,
          available: c.available,
          price: c.price,
          popular: c.popular,
          sortOrder: c.sortOrder,
        },
      });
  }
}

async function upsertPaymentMethods() {
  for (const pm of PAYMENT_METHODS) {
    await db
      .insert(paymentMethodsTable)
      .values(pm)
      .onConflictDoUpdate({
        target: paymentMethodsTable.slug,
        set: {
          name: pm.name,
          description: pm.description,
          color: pm.color,
          recommended: pm.recommended,
          sortOrder: pm.sortOrder,
        },
      });
  }
}

async function ensureDemoUser() {
  const phone = "+22507012345 67".replace(/\s+/g, "");
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);
  if (existing) {
    // Top up demo user balance to a nice round number for demos
    await db
      .update(usersTable)
      .set({ balance: sql`GREATEST(${usersTable.balance}, 12450)` })
      .where(eq(usersTable.id, existing.id));
    return existing.id;
  }
  const passwordHash = await bcrypt.hash("simix2026", 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      fullName: "Kouassi David",
      phone,
      countryCode: "+225",
      username: "kouassi_david",
      email: "kouassidavid@gmail.com",
      passwordHash,
      balance: 12_450,
      verified: true,
      status: "Standard",
    })
    .returning();
  if (!user) return null;

  // Seed a small transaction history
  const seedTx = [
    { type: "recharge", amount: 5000, method: "Orange Money", description: "Recharge Orange Money" },
    { type: "purchase", amount: 150, method: "wallet", description: "Numéro WhatsApp - Côte d'Ivoire" },
    { type: "recharge", amount: 10000, method: "MTN Mobile Money", description: "Recharge MTN" },
  ] as const;
  for (const t of seedTx) {
    await db.insert(transactionsTable).values({
      userId: user.id,
      type: t.type,
      amount: t.amount,
      status: "completed",
      method: t.method,
      description: t.description,
    });
  }
  return user.id;
}

async function main() {
  await upsertServices();
  await upsertCountries();
  await upsertPaymentMethods();
  await ensureDemoUser();
  // eslint-disable-next-line no-console
  console.log("Seed completed");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Seed failed", err);
  process.exit(1);
});
