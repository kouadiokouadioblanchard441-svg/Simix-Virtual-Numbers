import { db, systemSettingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const domain = process.env.REPLIT_DEV_DOMAIN
  ?? "5bff136c-16f2-44a8-882a-5d32f9923330-00-2q0yq614ryai3.picard.replit.dev";

const updates = [
  { key: "clapay_callback_url", value: `https://${domain}/api/wallet/clapay/webhook`,    desc: "URL webhook Clapay" },
  { key: "clapay_return_url",   value: `https://${domain}/wallet`,                        desc: "URL retour après paiement" },
  { key: "app_url",             value: `https://${domain}`,                               desc: "URL publique de l'app" },
];

async function run() {
  console.log(`\n🌐 Domaine : ${domain}\n`);
  for (const u of updates) {
    await db
      .insert(systemSettingsTable)
      .values({ key: u.key, value: u.value })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: sql`EXCLUDED.value`, updatedAt: sql`NOW()` },
      });
    console.log(`✓ ${u.desc} : ${u.value}`);
  }
  console.log("\n✅ URLs Clapay mises à jour dans Supabase\n");
  process.exit(0);
}

run().catch(e => { console.error("Erreur :", e.message); process.exit(1); });
