/**
 * seed-routing.ts — Seeds payment_gateways and mobile_operators at startup.
 *
 * Ensures Clapay + PawaPay gateways exist in the routing table,
 * and that all major African mobile operators are known.
 * Idempotent: uses INSERT … ON CONFLICT DO NOTHING / DO UPDATE.
 */
import {
  db,
  paymentGatewaysTable,
  mobileOperatorsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

async function upsertGateway(params: {
  slug: string;
  name: string;
  logoUrl?: string;
  apiUrl?: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  type?: string;
  supportedCountries?: string[];
  supportedOperators?: string[];
  notes?: string;
}) {
  const existing = await db.select({ id: paymentGatewaysTable.id })
    .from(paymentGatewaysTable)
    .where(eq(paymentGatewaysTable.slug, params.slug))
    .limit(1);

  if (existing.length > 0) {
    /* Update API key if supplied (don't overwrite with null) */
    if (params.apiKey) {
      await db.update(paymentGatewaysTable)
        .set({
          apiKey: params.apiKey,
          ...(params.apiUrl ? { apiUrl: params.apiUrl } : {}),
          ...(params.apiSecret ? { apiSecret: params.apiSecret } : {}),
          updatedAt: new Date(),
        })
        .where(eq(paymentGatewaysTable.slug, params.slug));
    }
    return;
  }

  await db.insert(paymentGatewaysTable).values({
    name: params.name,
    slug: params.slug,
    logoUrl: params.logoUrl ?? null,
    apiUrl: params.apiUrl ?? null,
    apiKey: params.apiKey ?? null,
    apiSecret: params.apiSecret ?? null,
    type: params.type ?? "deposit",
    supportedCountries: params.supportedCountries ?? [],
    supportedOperators: params.supportedOperators ?? [],
    active: true,
    testMode: false,
    notes: params.notes ?? null,
  });
  logger.info({ slug: params.slug }, "[seed-routing] Gateway inserted");
}

async function upsertOperator(params: {
  slug: string;
  name: string;
  color: string;
  logoUrl?: string;
  countryCodes: string[];
  sortOrder: number;
}) {
  const existing = await db.select({ id: mobileOperatorsTable.id })
    .from(mobileOperatorsTable)
    .where(eq(mobileOperatorsTable.slug, params.slug))
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(mobileOperatorsTable).values({
    name: params.name,
    slug: params.slug,
    logoUrl: params.logoUrl ?? null,
    color: params.color,
    countryCodes: params.countryCodes,
    active: true,
    sortOrder: params.sortOrder,
  });
  logger.info({ slug: params.slug }, "[seed-routing] Operator inserted");
}

export async function seedRoutingData(): Promise<void> {
  try {
    /* ── Gateways ────────────────────────────────────────────────── */
    await upsertGateway({
      slug: "pawapay",
      name: "PawaPay",
      logoUrl: "https://pawapay.com/favicon.ico",
      apiUrl: "https://api.pawapay.cloud",
      apiKey: process.env.PAWAPAY_API_TOKEN ?? null,
      type: "deposit",
      supportedCountries: ["CI", "SN", "CM", "GH", "TZ", "UG", "ZM", "ZW", "CD", "BJ", "BF", "ML", "MG", "RW", "MZ", "MW"],
      supportedOperators: ["mtn", "orange", "airtel", "vodacom", "zamtel", "tigo", "africell"],
      notes: "PawaPay — Mobile Money aggregator for 16+ African countries",
    });

    await upsertGateway({
      slug: "clapay",
      name: "Clapay",
      logoUrl: "https://clapay.net/favicon.ico",
      apiUrl: process.env.CLAPAY_BASE_URL ?? "https://api.clapay.net",
      apiKey: process.env.CLAPAY_API_TOKEN ?? null,
      type: "deposit",
      supportedCountries: ["CI", "SN", "CM", "BF", "BJ", "ML", "GN", "NE", "TG"],
      supportedOperators: ["orange", "mtn", "wave", "moov", "free"],
      notes: "Clapay — Mobile Money aggregator for West & Central Africa",
    });

    /* ── Mobile Operators ────────────────────────────────────────── */
    const operators = [
      { slug: "mtn", name: "MTN", color: "#FFC107", sortOrder: 1,
        countryCodes: ["CI", "CM", "GH", "SN", "BJ", "BF", "GN", "LR", "ZA", "RW", "UG", "ZM", "MW", "SS", "NG"] },
      { slug: "orange", name: "Orange", color: "#FF6B00", sortOrder: 2,
        countryCodes: ["CI", "SN", "CM", "ML", "BF", "NE", "GN", "LR", "BI", "CF", "CD", "MG", "MA", "TN", "EG"] },
      { slug: "wave", name: "Wave", color: "#00B4FF", sortOrder: 3,
        countryCodes: ["CI", "SN", "BF", "ML", "GN", "GM", "UG"] },
      { slug: "moov", name: "Moov Africa", color: "#0058A3", sortOrder: 4,
        countryCodes: ["CI", "BJ", "BF", "ML", "NE", "TG", "CD", "GA", "MG"] },
      { slug: "airtel", name: "Airtel Money", color: "#E30613", sortOrder: 5,
        countryCodes: ["CM", "GH", "RW", "UG", "TZ", "ZM", "MW", "NG", "KE", "CD", "MG", "BI"] },
      { slug: "free", name: "Free Money", color: "#CC0000", sortOrder: 6,
        countryCodes: ["SN", "GN"] },
      { slug: "expresso", name: "Expresso", color: "#009900", sortOrder: 7,
        countryCodes: ["SN", "GN"] },
      { slug: "mpesa", name: "M-Pesa", color: "#00A651", sortOrder: 8,
        countryCodes: ["KE", "TZ", "MZ", "GH", "ZA", "CD", "RW", "ET"] },
      { slug: "vodacom", name: "Vodacom M-Pesa", color: "#E60000", sortOrder: 9,
        countryCodes: ["TZ", "ZA", "MZ", "CD", "LT", "MG"] },
      { slug: "tigo", name: "Tigo Cash", color: "#0A5FBC", sortOrder: 10,
        countryCodes: ["TZ", "GH", "SN"] },
      { slug: "zamtel", name: "Zamtel Kwacha", color: "#006633", sortOrder: 11,
        countryCodes: ["ZM"] },
      { slug: "africell", name: "Africell", color: "#0066B3", sortOrder: 12,
        countryCodes: ["UG", "GM", "SL", "CD"] },
      { slug: "tmoney", name: "T-Money", color: "#00AEEF", sortOrder: 13,
        countryCodes: ["TG"] },
      { slug: "flooz", name: "Flooz", color: "#7B2D8B", sortOrder: 14,
        countryCodes: ["TG", "BJ"] },
      { slug: "mvola", name: "MVola", color: "#E30613", sortOrder: 15,
        countryCodes: ["MG"] },
    ];

    for (const op of operators) {
      await upsertOperator(op);
    }

    logger.info("[seed-routing] Payment routing data seeded successfully");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[seed-routing] Routing seed failed (non-blocking)");
  }
}
