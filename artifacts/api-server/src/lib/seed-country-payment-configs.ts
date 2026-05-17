/**
 * seed-country-payment-configs.ts
 *
 * Seeds the `country_payment_configs` table with all African countries
 * and their available mobile money methods. Idempotent: INSERT … ON CONFLICT DO NOTHING
 * so admin changes are never overwritten.
 *
 * Method slugs must match the `slug` column of `payment_methods`.
 */
import { db, countryPaymentConfigsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

interface Config {
  cc: string;      // ISO-2 country code
  slug: string;    // payment_methods.slug
  min?: number;    // min deposit in local currency (default: 100 XOF/unit)
  fee?: number;    // fee % (default: 0)
}

/**
 * Comprehensive Africa payment config — country × method combinations.
 * Only combinations that are actually supported by at least one gateway are included.
 */
const CONFIGS: Config[] = [
  /* ── Ivory Coast (CI) — XOF ── */
  { cc: "CI", slug: "orange_money", min: 500 },
  { cc: "CI", slug: "mtn_money",    min: 500 },
  { cc: "CI", slug: "wave",         min: 500 },
  { cc: "CI", slug: "moov_money",   min: 500 },

  /* ── Senegal (SN) — XOF ── */
  { cc: "SN", slug: "orange_money", min: 500 },
  { cc: "SN", slug: "wave",         min: 500 },
  { cc: "SN", slug: "free_money",   min: 500 },

  /* ── Cameroon (CM) — XAF ── */
  { cc: "CM", slug: "mtn_money",    min: 500 },
  { cc: "CM", slug: "orange_money", min: 500 },

  /* ── Burkina Faso (BF) — XOF ── */
  { cc: "BF", slug: "orange_money", min: 500 },
  { cc: "BF", slug: "moov_money",   min: 500 },
  { cc: "BF", slug: "wave",         min: 500 },

  /* ── Benin (BJ) — XOF ── */
  { cc: "BJ", slug: "mtn_money",    min: 500 },
  { cc: "BJ", slug: "moov_money",   min: 500 },
  { cc: "BJ", slug: "flooz",        min: 500 },

  /* ── Mali (ML) — XOF ── */
  { cc: "ML", slug: "orange_money", min: 500 },
  { cc: "ML", slug: "wave",         min: 500 },
  { cc: "ML", slug: "moov_money",   min: 500 },

  /* ── Guinea (GN) — GNF ── */
  { cc: "GN", slug: "orange_money", min: 5000 },
  { cc: "GN", slug: "mtn_money",    min: 5000 },
  { cc: "GN", slug: "free_money",   min: 5000 },

  /* ── Niger (NE) — XOF ── */
  { cc: "NE", slug: "airtel_money", min: 500 },
  { cc: "NE", slug: "moov_money",   min: 500 },

  /* ── Togo (TG) — XOF ── */
  { cc: "TG", slug: "tmoney",       min: 500 },
  { cc: "TG", slug: "flooz",        min: 500 },
  { cc: "TG", slug: "moov_money",   min: 500 },

  /* ── Ghana (GH) — GHS ── */
  { cc: "GH", slug: "mtn_money",    min: 2 },
  { cc: "GH", slug: "airtel_money", min: 2 },

  /* ── Kenya (KE) — KES ── */
  { cc: "KE", slug: "mpesa",        min: 50 },
  { cc: "KE", slug: "airtel_money", min: 50 },

  /* ── Tanzania (TZ) — TZS ── */
  { cc: "TZ", slug: "mpesa",        min: 1000 },
  { cc: "TZ", slug: "vodacom_mpesa",min: 1000 },
  { cc: "TZ", slug: "airtel_money", min: 1000 },

  /* ── Uganda (UG) — UGX ── */
  { cc: "UG", slug: "mtn_money",    min: 2000 },
  { cc: "UG", slug: "airtel_money", min: 2000 },

  /* ── Rwanda (RW) — RWF ── */
  { cc: "RW", slug: "mtn_money",    min: 500 },
  { cc: "RW", slug: "airtel_money", min: 500 },

  /* ── Zambia (ZM) — ZMW ── */
  { cc: "ZM", slug: "airtel_money", min: 5 },
  { cc: "ZM", slug: "mtn_money",    min: 5 },
  { cc: "ZM", slug: "zamtel",       min: 5 },

  /* ── Zimbabwe (ZW) — ZWL ── */
  { cc: "ZW", slug: "econet",       min: 100 },

  /* ── Malawi (MW) — MWK ── */
  { cc: "MW", slug: "airtel_money", min: 500 },
  { cc: "MW", slug: "mpesa",        min: 500 },

  /* ── Mozambique (MZ) — MZN ── */
  { cc: "MZ", slug: "mpesa",        min: 50 },
  { cc: "MZ", slug: "vodacom_mpesa",min: 50 },

  /* ── DR Congo (CD) — CDF ── */
  { cc: "CD", slug: "mtn_money",    min: 1000 },
  { cc: "CD", slug: "airtel_money", min: 1000 },

  /* ── Republic of Congo (CG) — XAF ── */
  { cc: "CG", slug: "mtn_money",    min: 500 },
  { cc: "CG", slug: "airtel_money", min: 500 },

  /* ── Gabon (GA) — XAF ── */
  { cc: "GA", slug: "airtel_money", min: 500 },

  /* ── Madagascar (MG) — MGA ── */
  { cc: "MG", slug: "mvola",        min: 2000 },
  { cc: "MG", slug: "airtel_money", min: 2000 },

  /* ── Nigeria (NG) — NGN ── */
  { cc: "NG", slug: "mtn_money",    min: 500 },
  { cc: "NG", slug: "airtel_money", min: 500 },

  /* ── South Africa (ZA) — ZAR ── */
  { cc: "ZA", slug: "mpesa",        min: 10 },
];

export async function seedCountryPaymentConfigs(): Promise<void> {
  try {
    let inserted = 0;
    let skipped = 0;

    for (const c of CONFIGS) {
      try {
        const result = await db
          .insert(countryPaymentConfigsTable)
          .values({
            countryCode: c.cc,
            methodSlug:  c.slug,
            enabled:     true,
            minDeposit:  c.min ?? 100,
            feePercent:  c.fee ?? 0,
          })
          /* Never overwrite admin changes — only insert if row doesn't exist */
          .onConflictDoNothing();

        const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        if (count > 0) inserted++;
        else skipped++;
      } catch {
        skipped++;
      }
    }

    logger.info(
      { total: CONFIGS.length, inserted, skipped },
      "[seed-configs] Country payment configs seeded",
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[seed-configs] Country payment config seed failed (non-blocking)");
  }
}
