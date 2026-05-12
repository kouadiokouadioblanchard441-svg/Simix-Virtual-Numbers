/**
 * Seed payment methods at startup — idempotent (upsert by slug).
 * Ensures the payment methods table is always populated even on a fresh DB.
 */

import { db, paymentMethodsTable } from "@workspace/db";
import { logger } from "./logger";

const PAYMENT_METHODS = [
  { name: "Orange Money",     slug: "orange_money", description: "Orange CI, SN, ML, BF", color: "#FF7A00", recommended: true,  sortOrder: 10 },
  { name: "MTN Mobile Money", slug: "mtn_money",    description: "MTN CI, GH, CM, NG",    color: "#FFCC00", recommended: true,  sortOrder: 20 },
  { name: "Wave",             slug: "wave",          description: "Wave CI, SN",            color: "#1AC9FF", recommended: true,  sortOrder: 30 },
  { name: "Moov Money",      slug: "moov_money",    description: "Moov CI, BJ, TG, BF",   color: "#0066CC", recommended: false, sortOrder: 40 },
  { name: "Airtel Money",    slug: "airtel_money",  description: "Airtel NG, KE, TZ, UG", color: "#FF0000", recommended: false, sortOrder: 50 },
  { name: "M-Pesa",          slug: "mpesa",         description: "M-Pesa KE, TZ, MZ",     color: "#4CAF50", recommended: false, sortOrder: 60 },
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
