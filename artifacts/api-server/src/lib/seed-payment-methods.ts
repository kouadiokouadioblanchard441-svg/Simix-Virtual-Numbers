/**
 * Seed payment methods at startup — idempotent (upsert by slug).
 * Ensures the payment_methods table always has all African mobile money operators.
 */

import { db, paymentMethodsTable } from "@workspace/db";
import { logger } from "./logger";

const PAYMENT_METHODS = [
  /* ── West Africa (primary) ── */
  { name: "Orange Money",       slug: "orange_money",  description: "CI, SN, ML, BF, CM, GN, NE", color: "#FF7A00", recommended: true,  sortOrder: 10 },
  { name: "MTN Mobile Money",   slug: "mtn_money",     description: "CI, GH, CM, NG, UG, RW, ZM",  color: "#FFCC00", recommended: true,  sortOrder: 20 },
  { name: "Wave",               slug: "wave",           description: "CI, SN, BF, ML, GN",          color: "#1AC9FF", recommended: true,  sortOrder: 30 },
  { name: "Moov Money",        slug: "moov_money",    description: "CI, BJ, TG, BF, ML, NE",       color: "#0066CC", recommended: false, sortOrder: 40 },
  { name: "Free Money",        slug: "free_money",    description: "SN, GN",                        color: "#CC0000", recommended: false, sortOrder: 50 },
  /* ── East & Southern Africa ── */
  { name: "Airtel Money",      slug: "airtel_money",  description: "GH, KE, TZ, UG, RW, ZM, MW",  color: "#FF0000", recommended: false, sortOrder: 60 },
  { name: "M-Pesa",            slug: "mpesa",          description: "KE, TZ, MZ, MW, ZA",           color: "#4CAF50", recommended: false, sortOrder: 70 },
  { name: "Vodacom M-Pesa",    slug: "vodacom_mpesa", description: "TZ, MZ, ZA",                    color: "#E60000", recommended: false, sortOrder: 80 },
  { name: "Zamtel Kwacha",     slug: "zamtel",         description: "ZM",                            color: "#006633", recommended: false, sortOrder: 90 },
  /* ── Central Africa ── */
  { name: "Flooz",             slug: "flooz",          description: "TG, BJ",                        color: "#7B2D8B", recommended: false, sortOrder: 100 },
  { name: "T-Money",           slug: "tmoney",         description: "TG",                            color: "#00AEEF", recommended: false, sortOrder: 110 },
  { name: "MVola",             slug: "mvola",           description: "MG (Madagascar)",               color: "#E30613", recommended: false, sortOrder: 120 },
  /* ── Southern Africa ── */
  { name: "EcoCash (Econet)",  slug: "econet",         description: "ZW (Zimbabwe)",                 color: "#009900", recommended: false, sortOrder: 130 },
] as const;

export async function seedPaymentMethods(): Promise<void> {
  try {
    for (const pm of PAYMENT_METHODS) {
      await db
        .insert(paymentMethodsTable)
        .values(pm)
        .onConflictDoUpdate({
          target: paymentMethodsTable.slug,
          set: {
            name:        pm.name,
            description: pm.description,
            color:       pm.color,
            recommended: pm.recommended,
            sortOrder:   pm.sortOrder,
          },
        });
    }
    logger.info({ count: PAYMENT_METHODS.length }, "[seed-payments] Payment methods seeded");
  } catch (err) {
    logger.error({ err }, "[seed-payments] Failed to seed payment methods — continuing startup");
  }
}
