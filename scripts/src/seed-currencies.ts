/**
 * Seed initial currency data for the multi-devise system.
 * Rates calibrated to May 2026 market rates (1 USD ≈ 605 XOF, EUR/XOF = 655.957 fixed).
 * Run: DATABASE_URL="$SUPABASE_DATABASE_URL" pnpm --filter @workspace/scripts exec tsx src/seed-currencies.ts
 */
import { db, currenciesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/*
 * Methodology:
 *   1 USD ≈ 605 XOF (EUR/XOF = 655.957, EUR/USD ≈ 1.085)
 *   realRate  = mid-market rate (interbank, rounded)
 *   clientRate = realRate + spread margin (6–12 % depending on liquidity)
 *
 * Rates last updated: 2026-05-14
 */
const CURRENCIES = [
  /* ── Zone UEMOA (XOF) — parité fixe, pas de conversion ── */
  { countryCode: "CI", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "SN", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "ML", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "BF", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "BJ", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "NE", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "TG", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },
  { countryCode: "GW", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1",    clientRate: "1"    },

  /* ── Zone CEMAC (XAF) — parité fixe 1:1 avec XOF ── */
  { countryCode: "CM", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1",    clientRate: "1"    },
  { countryCode: "GA", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1",    clientRate: "1"    },
  { countryCode: "CG", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1",    clientRate: "1"    },
  { countryCode: "TD", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1",    clientRate: "1"    },

  /* ── Devises avec conversion FX ──
   *   GHS  1 USD ≈ 15.5 GHS  → 1 GHS ≈ 605/15.5 = 39.03 XOF   */
  { countryCode: "GH", currencyCode: "GHS", currencyName: "Cédi ghanéen",        realRate: "38",    clientRate: "42"    },

  /*   NGN  1 USD ≈ 1 580 NGN → 1 NGN ≈ 605/1580  = 0.383 XOF   */
  { countryCode: "NG", currencyCode: "NGN", currencyName: "Naira nigérian",       realRate: "0.38",  clientRate: "0.42"  },

  /*   KES  1 USD ≈  130 KES  → 1 KES ≈ 605/130   = 4.65  XOF   */
  { countryCode: "KE", currencyCode: "KES", currencyName: "Shilling kenyan",      realRate: "4.65",  clientRate: "5.10"  },

  /*   TZS  1 USD ≈ 2 680 TZS → 1 TZS ≈ 605/2680  = 0.226 XOF   */
  { countryCode: "TZ", currencyCode: "TZS", currencyName: "Shilling tanzanien",   realRate: "0.226", clientRate: "0.250" },

  /*   UGX  1 USD ≈ 3 750 UGX → 1 UGX ≈ 605/3750  = 0.161 XOF   */
  { countryCode: "UG", currencyCode: "UGX", currencyName: "Shilling ougandais",   realRate: "0.161", clientRate: "0.178" },

  /*   GNF  1 USD ≈ 8 600 GNF → 1 GNF ≈ 605/8600  = 0.070 XOF   */
  { countryCode: "GN", currencyCode: "GNF", currencyName: "Franc guinéen",        realRate: "0.070", clientRate: "0.078" },

  /*   MAD  1 USD ≈  10.0 MAD → 1 MAD ≈ 605/10.0  = 60.5  XOF   */
  { countryCode: "MA", currencyCode: "MAD", currencyName: "Dirham marocain",      realRate: "60",    clientRate: "66"    },

  /*   MRU  1 USD ≈  37.5 MRU → 1 MRU ≈ 605/37.5  = 16.1  XOF
   *   (L'Ouguiya a été redenominé de MRO → MRU en 2018 au taux 10:1) */
  { countryCode: "MR", currencyCode: "MRU", currencyName: "Ouguiya mauritanien",  realRate: "16",    clientRate: "18"    },
];

async function seed() {
  console.log("Seeding currencies…");
  console.log("Note: Taux calibrés au 14 mai 2026 (1 USD ≈ 605 XOF)");
  let inserted = 0;
  let updated  = 0;

  for (const c of CURRENCIES) {
    const existing = await db
      .select()
      .from(currenciesTable)
      .where(eq(currenciesTable.countryCode, c.countryCode))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(currenciesTable)
        .set({
          currencyCode: c.currencyCode,
          currencyName: c.currencyName,
          realRate:     c.realRate,
          clientRate:   c.clientRate,
          active:       true,
        })
        .where(eq(currenciesTable.countryCode, c.countryCode));
      updated++;
    } else {
      await db.insert(currenciesTable).values({ ...c, active: true });
      inserted++;
    }
  }

  console.log(`✓ Done — ${inserted} insérées, ${updated} mises à jour.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
