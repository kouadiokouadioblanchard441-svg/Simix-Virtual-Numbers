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
import { db, apiProvidersTable, servicesTable, systemSettingsTable } from "@workspace/db";
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
