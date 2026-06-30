import { db, systemSettingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const SK = process.env.CLAPAY_SK ?? "";
const UK = process.env.CLAPAY_UK ?? "";

if (!SK || !UK) {
  console.error("Variables CLAPAY_SK et CLAPAY_UK requises");
  process.exit(1);
}

const updates = [
  { key: "clapay_api_token",   value: SK, desc: "Clé secrète (Bearer auth API)" },
  { key: "clapay_public_key",  value: UK, desc: "Clé publique (vérification webhooks)" },
];

async function run() {
  for (const u of updates) {
    await db
      .insert(systemSettingsTable)
      .values({ key: u.key, value: u.value })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: sql`EXCLUDED.value`, updatedAt: sql`NOW()` },
      });
    console.log(`✓ ${u.desc} : ${u.key} = ${u.value.slice(0, 12)}...`);
  }
  console.log("\n✅ Clés Clapay mises à jour dans Supabase");
  process.exit(0);
}

run().catch(e => { console.error("Erreur :", e.message); process.exit(1); });
