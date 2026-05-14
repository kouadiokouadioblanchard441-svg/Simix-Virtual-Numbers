/**
 * Seed initial currency data for the multi-devise system.
 * Run: pnpm --filter @workspace/scripts exec tsx src/seed-currencies.ts
 */
import { db, currenciesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CURRENCIES = [
  /* XOF zone (UEMOA) — taux 1:1 */
  { countryCode: "CI", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "SN", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "ML", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "BF", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "BJ", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "NE", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "TG", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },
  { countryCode: "GW", currencyCode: "XOF", currencyName: "Franc CFA UEMOA", realRate: "1", clientRate: "1" },

  /* XAF zone (CEMAC) — parité fixe 1:1 avec XOF */
  { countryCode: "CM", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1", clientRate: "1" },
  { countryCode: "GA", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1", clientRate: "1" },
  { countryCode: "CG", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1", clientRate: "1" },
  { countryCode: "TD", currencyCode: "XAF", currencyName: "Franc CFA CEMAC", realRate: "1", clientRate: "1" },

  /* Devises avec conversion */
  { countryCode: "GH", currencyCode: "GHS", currencyName: "Cedi ghanéen",       realRate: "49",   clientRate: "52"   },
  { countryCode: "NG", currencyCode: "NGN", currencyName: "Naira nigérian",      realRate: "0.41", clientRate: "0.45" },
  { countryCode: "KE", currencyCode: "KES", currencyName: "Shilling kenyan",     realRate: "4.2",  clientRate: "4.9"  },
  { countryCode: "TZ", currencyCode: "TZS", currencyName: "Shilling tanzanien",  realRate: "0.026","clientRate": "0.03"},
  { countryCode: "UG", currencyCode: "UGX", currencyName: "Shilling ougandais",  realRate: "0.017","clientRate": "0.02"},
  { countryCode: "GN", currencyCode: "GNF", currencyName: "Franc guinéen",       realRate: "0.073","clientRate": "0.08"},
  { countryCode: "MA", currencyCode: "MAD", currencyName: "Dirham marocain",     realRate: "62",   clientRate: "65"   },
  { countryCode: "MR", currencyCode: "MRO", currencyName: "Ouguiya mauritanien", realRate: "1.65", clientRate: "1.85" },
];

async function seed() {
  console.log("Seeding currencies…");
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
        .set({ currencyCode: c.currencyCode, currencyName: c.currencyName, realRate: c.realRate, clientRate: c.clientRate, active: true })
        .where(eq(currenciesTable.countryCode, c.countryCode));
      updated++;
    } else {
      await db.insert(currenciesTable).values({ ...c, active: true });
      inserted++;
    }
  }

  console.log(`Done — ${inserted} insérées, ${updated} mises à jour.`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
