import { db, paymentGatewaysTable, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const sk = process.env.CLAPAY_SK ?? "";
const uk = process.env.CLAPAY_UK ?? "";

if (!sk) {
  console.error("Variable CLAPAY_SK requise");
  process.exit(1);
}

async function run() {
  // 1. Mettre à jour payment_gateways (priorité absolue dans buildClapayClient)
  const rows = await db
    .update(paymentGatewaysTable)
    .set({ apiKey: sk, updatedAt: new Date() })
    .where(eq(paymentGatewaysTable.slug, "clapay"))
    .returning({ id: paymentGatewaysTable.id, slug: paymentGatewaysTable.slug });

  if (rows.length) {
    console.log(`✓ payment_gateways.apiKey mis à jour (slug=clapay, id=${rows[0].id})`);
  } else {
    console.log("⚠ Aucun gateway clapay trouvé — le seeding va le créer au prochain démarrage");
  }

  // 2. Mettre à jour system_settings (clapay_api_token et clapay_public_key)
  const settings: Array<{ key: string; value: string; desc: string }> = [
    { key: "clapay_api_token",  value: sk, desc: "Clé secrète" },
  ];
  if (uk) settings.push({ key: "clapay_public_key", value: uk, desc: "Clé publique" });

  for (const s of settings) {
    await db
      .insert(systemSettingsTable)
      .values({ key: s.key, value: s.value })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: sql`EXCLUDED.value`, updatedAt: sql`NOW()` },
      });
    console.log(`✓ system_settings.${s.key} = ${s.value.slice(0, 14)}... (${s.desc})`);
  }

  console.log("\n✅ Clés Clapay mises à jour partout dans Supabase");
  process.exit(0);
}

run().catch(e => { console.error("Erreur :", e.message); process.exit(1); });
