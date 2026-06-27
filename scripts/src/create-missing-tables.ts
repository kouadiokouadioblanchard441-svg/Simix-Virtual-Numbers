import { pool } from "@workspace/db";

async function main() {
  const client = await pool.connect();
  try {
    console.log("🔧 Création des tables manquantes...\n");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    console.log("✅ Table 'conversations' créée");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    console.log("✅ Table 'messages' créée");

    // Vérification finale
    const res = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename IN ('conversations','messages')
    `);
    console.log("\n✅ Vérification finale:", res.rows.map((r: any) => r.tablename).join(', '));

    // Compte total des tables
    const total = await client.query(`
      SELECT count(*) FROM pg_tables WHERE schemaname = 'public'
    `);
    console.log("📊 Total tables dans Supabase:", total.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error("ERREUR:", e.message); process.exit(1); });
