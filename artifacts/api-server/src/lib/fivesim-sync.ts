/**
 * 5sim Service Synchronisation
 *
 * Fetches product catalogue from 5sim and upserts it into the local `services` table:
 *   - Updates price + availability for existing services (batch upsert)
 *   - Inserts brand-new services (disabled by default so admin can review)
 *   - Persists last-sync timestamp to `system_settings`
 *
 * Countries sampled (best coverage for Simix's African + global audience):
 *   ivorycoast, senegal, cameroon, nigeria, ghana, togo, benin, guinea,
 *   kenya, tanzania, southafrica, france, usa, india, brazil, indonesia
 *
 * Run automatically every SYNC_INTERVAL_MS (default 6 h).
 * Also callable on-demand via syncFiveSimProducts().
 */

import { sql } from "drizzle-orm";
import { db, apiProvidersTable, servicesTable, systemSettingsTable, countriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { FiveSimClient, type FiveSimProductsResponse } from "./fivesim";
import { logger } from "./logger";

/* ─── Config ─── */
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 hours
const LAST_SYNC_KEY    = "fivesim_last_sync";
const SYNC_STATUS_KEY  = "fivesim_sync_status";

/* Top countries to sample — widest catalogue coverage without hammering the API */
const SAMPLE_COUNTRIES = [
  "ivorycoast", "senegal", "cameroon", "nigeria", "ghana",
  "togo", "benin", "guinea", "kenya",
  "tanzania", "southafrica", "france", "usa", "india",
  "brazil", "indonesia",
];

/* Category labels for known 5sim product names */
const CATEGORY_MAP: Record<string, string> = {
  whatsapp: "Messagerie", telegram: "Messagerie", viber: "Messagerie",
  line: "Messagerie", wechat: "Messagerie", signal: "Messagerie",
  facebook: "Réseaux sociaux", instagram: "Réseaux sociaux", twitter: "Réseaux sociaux",
  tiktok: "Réseaux sociaux", snapchat: "Réseaux sociaux", linkedin: "Réseaux sociaux",
  pinterest: "Réseaux sociaux",
  google: "Tech", microsoft: "Tech", apple: "Tech", yahoo: "Tech",
  amazon: "E-commerce", ebay: "E-commerce", shopee: "E-commerce", lazada: "E-commerce",
  paypal: "Finance", binance: "Finance", coinbase: "Finance",
  uber: "Transport", airbnb: "Voyages",
  netflix: "Divertissement", steam: "Divertissement", discord: "Divertissement",
};

/* Color palette for known services */
const COLOR_MAP: Record<string, string> = {
  whatsapp: "#25D366", telegram: "#2AABEE", viber: "#7360F2",
  facebook: "#1877F2", instagram: "#E1306C", twitter: "#1DA1F2",
  tiktok: "#010101", snapchat: "#FFFC00", linkedin: "#0A66C2",
  google: "#4285F4", microsoft: "#00A4EF", apple: "#555555",
  amazon: "#FF9900", paypal: "#003087", binance: "#F0B90B",
  uber: "#333333", airbnb: "#FF5A5F", netflix: "#E50914",
  discord: "#5865F2", steam: "#171A21", youtube: "#FF0000",
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncRunning = false;

/* ─── Public API ─── */

export function startFiveSimSyncScheduler(): void {
  if (syncRunning) return;
  syncRunning = true;
  logger.info("[5sim-sync] Scheduler started (interval: 6h) — first sync in 30s");
  syncTimer = setTimeout(() => void runSync(), 30_000);
}

export function stopFiveSimSyncScheduler(): void {
  syncRunning = false;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  logger.info("[5sim-sync] Scheduler stopped");
}

/** On-demand sync — also used by admin "Sync produits" button */
export async function syncFiveSimProducts(): Promise<{ added: number; updated: number; total: number }> {
  /* Get active 5sim provider */
  const [provider] = await db
    .select()
    .from(apiProvidersTable)
    .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
    .limit(1);

  if (!provider?.apiKey) {
    throw new Error("Aucun fournisseur 5sim actif avec clé API");
  }

  const client = new FiveSimClient(provider.apiKey);
  const markup  = provider.markup;

  /* ── 1. Collect products across all sample countries ── */
  const merged: Record<string, { category: string; qty: number; price: number }> = {};

  for (const country of SAMPLE_COUNTRIES) {
    try {
      const products: FiveSimProductsResponse = await client.getProducts(country, "any");
      for (const [name, info] of Object.entries(products)) {
        if (!info || info.Qty < 1) continue;
        const existing = merged[name];
        if (!existing || info.Price < existing.price) {
          merged[name] = {
            category: info.Category ?? "Autre",
            qty: Math.max(existing?.qty ?? 0, info.Qty),
            price: info.Price,
          };
        } else {
          merged[name].qty = Math.max(merged[name].qty, info.Qty);
        }
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, country }, "[5sim-sync] Skipping country");
    }
  }

  const productList = Object.entries(merged);
  logger.info({ count: productList.length }, "[5sim-sync] Products fetched from 5sim");

  if (productList.length === 0) {
    throw new Error("Aucun produit reçu depuis 5sim");
  }

  /* ── 2. Count existing services before upsert (to compute added vs updated) ── */
  const [{ existingCount }] = await db
    .select({ existingCount: sql<number>`count(*)::int` })
    .from(servicesTable);

  /* ── 3. Batch upsert — single query for all products ── */
  const BATCH_SIZE = 100;
  for (let i = 0; i < productList.length; i += BATCH_SIZE) {
    const batch = productList.slice(i, i + BATCH_SIZE);

    const rows = batch.map(([slug, info]) => {
      const priceInFcfa     = Math.round(info.price * 655);
      const priceWithMarkup = Math.round(priceInFcfa * (1 + markup / 100));
      const prettyName      = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " ");
      return {
        name:          prettyName,
        slug,
        price:         priceWithMarkup,
        providerPrice: priceInFcfa,
        margin:        markup,
        available:     info.qty,
        category:      CATEGORY_MAP[slug.toLowerCase()] ?? "Autre",
        color:         COLOR_MAP[slug.toLowerCase()] ?? "#7C3AED",
        enabled:       false as boolean,
        sortOrder:     200,
      };
    });

    await db
      .insert(servicesTable)
      .values(rows)
      .onConflictDoUpdate({
        target: servicesTable.slug,
        set: {
          price:         sql`excluded.price`,
          providerPrice: sql`excluded.provider_price`,
          available:     sql`excluded.available`,
          margin:        sql`excluded.margin`,
        },
      });
  }

  /* ── 4. Count new services ── */
  const [{ newCount }] = await db
    .select({ newCount: sql<number>`count(*)::int` })
    .from(servicesTable);

  const added   = Math.max(0, newCount - existingCount);
  const updated = productList.length - added;

  /* ── 5. Persist sync metadata ── */
  const now    = new Date().toISOString();
  const status = `${added} ajoutés · ${updated} mis à jour · ${productList.length} total`;

  await db.insert(systemSettingsTable).values({ key: LAST_SYNC_KEY, value: now })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: now } });
  await db.insert(systemSettingsTable).values({ key: SYNC_STATUS_KEY, value: status })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: status } });

  logger.info({ added, updated, total: productList.length }, "[5sim-sync] Sync complete");
  return { added, updated, total: productList.length };
}

/* ─── French country name mapping (ISO → French name) ─── */
const FR_NAMES: Record<string, string> = {
  AF: "Afghanistan", AL: "Albanie", DZ: "Algérie", AO: "Angola", AG: "Antigua-et-Barbuda",
  AR: "Argentine", AM: "Arménie", AU: "Australie", AT: "Autriche", AZ: "Azerbaïdjan",
  BH: "Bahreïn", BD: "Bangladesh", BE: "Belgique", BJ: "Bénin", BO: "Bolivie",
  BA: "Bosnie-Herzégovine", BW: "Botswana", BR: "Brésil", BG: "Bulgarie",
  BF: "Burkina Faso", BI: "Burundi", KH: "Cambodge", CM: "Cameroun", CA: "Canada",
  CV: "Cap-Vert", CF: "Centrafrique", TD: "Tchad", CL: "Chili", CO: "Colombie",
  KM: "Comores", CG: "Congo-Brazzaville", CD: "RD Congo", CR: "Costa Rica",
  HR: "Croatie", CY: "Chypre", CZ: "République tchèque", DK: "Danemark",
  DJ: "Djibouti", DO: "République dominicaine", EC: "Équateur", EG: "Égypte",
  GB: "Royaume-Uni", SV: "Salvador", GQ: "Guinée équatoriale", ER: "Érythrée",
  ET: "Éthiopie", FI: "Finlande", FR: "France", GA: "Gabon", GM: "Gambie",
  GE: "Géorgie", DE: "Allemagne", GH: "Ghana", GR: "Grèce", GT: "Guatemala",
  GN: "Guinée", GW: "Guinée-Bissau", GY: "Guyana", HT: "Haïti", HN: "Honduras",
  HK: "Hong Kong", HU: "Hongrie", IN: "Inde", ID: "Indonésie", IE: "Irlande",
  IL: "Israël", IT: "Italie", CI: "Côte d'Ivoire", JM: "Jamaïque", JP: "Japon",
  JO: "Jordanie", KZ: "Kazakhstan", KE: "Kenya", KW: "Koweït", KG: "Kirghizistan",
  LA: "Laos", LV: "Lettonie", LS: "Lesotho", LR: "Liberia", LY: "Libye",
  LT: "Lituanie", LU: "Luxembourg", MG: "Madagascar", MW: "Malawi", MY: "Malaisie",
  MV: "Maldives", ML: "Mali", MR: "Mauritanie", MU: "Maurice", MX: "Mexique",
  MD: "Moldavie", MN: "Mongolie", ME: "Monténégro", MA: "Maroc", MZ: "Mozambique",
  NA: "Namibie", NP: "Népal", NL: "Pays-Bas", NI: "Nicaragua", NE: "Niger",
  NG: "Nigeria", MK: "Macédoine du Nord", NO: "Norvège", OM: "Oman",
  PK: "Pakistan", PA: "Panama", PY: "Paraguay", PE: "Pérou", PH: "Philippines",
  PL: "Pologne", PT: "Portugal", RO: "Roumanie", RW: "Rwanda", SN: "Sénégal",
  RS: "Serbie", SL: "Sierra Leone", SK: "Slovaquie", SI: "Slovénie",
  SO: "Somalie", ZA: "Afrique du Sud", ES: "Espagne", LK: "Sri Lanka",
  SD: "Soudan", SS: "Soudan du Sud", SR: "Suriname", SZ: "Eswatini",
  SE: "Suède", TW: "Taïwan", TJ: "Tadjikistan", TZ: "Tanzanie", TH: "Thaïlande",
  TG: "Togo", TN: "Tunisie", TM: "Turkménistan", UG: "Ouganda", UA: "Ukraine",
  AE: "Émirats arabes unis", US: "États-Unis", UY: "Uruguay", UZ: "Ouzbékistan",
  VE: "Venezuela", VN: "Viêt Nam", YE: "Yémen", ZM: "Zambie", ZW: "Zimbabwe",
  KR: "Corée du Sud", KP: "Corée du Nord", MM: "Myanmar", PG: "Papouasie-N.-Guinée",
  NZ: "Nouvelle-Zélande", FJ: "Fidji", VU: "Vanuatu", SB: "Îles Salomon",
  SC: "Seychelles", ST: "São Tomé-et-Príncipe", KM2: "Comores", LS2: "Lesotho",
};

const POPULAR_ISO = new Set([
  "CI", "SN", "CM", "NG", "GH", "KE", "ZA", "MA", "TN", "EG",
  "FR", "US", "GB", "DE", "IN", "BR", "ID", "ML", "BF", "GN", "TG", "BJ",
]);

function flagEmoji(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
}

/** Sync all countries from 5sim /guest/countries endpoint into the local DB */
export async function syncFiveSimCountries(): Promise<{ added: number; updated: number; total: number }> {
  logger.info("[5sim-countries] Starting country sync from 5sim");

  /* Fetch countries from 5sim (no auth needed) */
  const resp = await fetch("https://5sim.net/v1/guest/countries", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) {
    throw new Error(`5sim /guest/countries returned ${resp.status}`);
  }
  const raw = await resp.json() as Record<string, { iso?: Record<string, number>; prefix?: Record<string, number>; text_en?: string }>;

  const entries = Object.entries(raw);
  logger.info({ count: entries.length }, "[5sim-countries] Countries fetched from 5sim");

  /* Count existing before upsert */
  const [{ before }] = await db
    .select({ before: sql<number>`count(*)::int` })
    .from(countriesTable);

  let skipped = 0;

  for (const [, info] of entries) {
    const isoRaw = Object.keys(info.iso ?? {})[0];
    const prefixRaw = Object.keys(info.prefix ?? {})[0];
    if (!isoRaw || !prefixRaw) { skipped++; continue; }

    const iso = isoRaw.toUpperCase();
    const dialCode = prefixRaw.startsWith("+") ? prefixRaw : `+${prefixRaw}`;
    const flag = flagEmoji(iso);
    const nameEn = info.text_en ?? iso;
    const nameFr = FR_NAMES[iso] ?? nameEn;
    const popular = POPULAR_ISO.has(iso);
    const sortOrder = popular ? 10 : 100;

    await db.insert(countriesTable)
      .values({
        name: nameFr,
        code: iso,
        dialCode,
        flag,
        available: 1,
        price: 150,
        popular,
        sortOrder,
      })
      .onConflictDoUpdate({
        target: countriesTable.code,
        set: {
          name:     sql`CASE WHEN excluded.name != countries.name AND countries.name = countries.code THEN excluded.name ELSE countries.name END`,
          dialCode: sql`excluded.dial_code`,
          flag:     sql`excluded.flag`,
          popular:  sql`excluded.popular`,
          sortOrder: sql`LEAST(countries.sort_order, excluded.sort_order)`,
        },
      });
  }

  /* Count after upsert */
  const [{ after }] = await db
    .select({ after: sql<number>`count(*)::int` })
    .from(countriesTable);

  const added   = Math.max(0, after - before);
  const updated = entries.length - skipped - added;

  /* Persist sync timestamp */
  const now = new Date().toISOString();
  await db.insert(systemSettingsTable)
    .values({ key: "fivesim_countries_last_sync", value: now })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: now } });
  await db.insert(systemSettingsTable)
    .values({ key: "fivesim_countries_sync_status", value: `${added} ajoutés · ${updated} mis à jour · ${entries.length - skipped} total` })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: sql`excluded.value` } });

  logger.info({ added, updated, skipped, total: entries.length }, "[5sim-countries] Country sync complete");
  return { added, updated, total: entries.length - skipped };
}

/* ─── Internal scheduler loop ─── */

async function runSync(): Promise<void> {
  try {
    await syncFiveSimProducts();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[5sim-sync] Scheduled sync failed");
  } finally {
    if (syncRunning) {
      syncTimer = setTimeout(() => void runSync(), SYNC_INTERVAL_MS);
    }
  }
}
