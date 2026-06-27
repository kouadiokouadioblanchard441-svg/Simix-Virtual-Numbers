import { pool } from "@workspace/db";

async function main() {
  try {
    const ver = await pool.query('SELECT version()');
    console.log("✅ CONNEXION OK:", ver.rows[0].version.split(' ').slice(0,2).join(' '));

    const res = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    const existing: string[] = res.rows.map((r: any) => r.tablename);
    console.log("\n📋 TABLES EXISTANTES (" + existing.length + "):");
    existing.forEach((t) => console.log("  ✅ " + t));

    const expected = [
      'users','services','countries','payment_methods','virtual_numbers',
      'sms_messages','transactions','sessions','admin_logs','api_providers',
      'system_settings','country_payment_configs','support_tickets','support_messages',
      'ai_support_conversations','ai_support_messages','admin_security_events',
      'footer_sections','notifications','email_campaigns','email_campaign_recipients',
      'banners','email_otp','login_history','ip_blacklist','payment_routes',
      'service_prices','currencies','fx_profits','service_country_availability','referrals'
    ];

    const missing = expected.filter(t => !existing.includes(t));
    console.log("\n❌ TABLES MANQUANTES (" + missing.length + "):");
    if (missing.length === 0) console.log("  Aucune — toutes présentes !");
    else missing.forEach(t => console.log("  ❌ " + t));

    const extra = existing.filter(t => !expected.includes(t) && !t.startsWith('__drizzle'));
    if (extra.length > 0) {
      console.log("\n➕ TABLES SUPPLÉMENTAIRES (non dans la liste attendue):");
      extra.forEach(t => console.log("  ➕ " + t));
    }

    const migRes = await pool.query(`SELECT id FROM __drizzle_migrations ORDER BY id`).catch(() => ({rows:[]}));
    console.log("\n📦 MIGRATIONS DRIZZLE APPLIQUÉES:", (migRes as any).rows.length);
  } finally {
    await pool.end();
  }
}
main().catch(e => { console.error("ERREUR:", e.message); process.exit(1); });
