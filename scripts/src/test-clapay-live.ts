/**
 * Test Clapay LIVE MTN Côte d'Ivoire
 * Passe par le serveur API local (port 8080) qui a accès réseau à api.clapay.net
 */
import { db, usersTable, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const API       = `http://localhost:${process.env.PORT ?? 8080}/api`;
const ACCOUNT_PHONE = process.env.CLAPAY_TEST_ACCOUNT_PHONE;
const TARGET_PHONE = process.env.CLAPAY_LIVE_TARGET_PHONE;
const ACCOUNT_PASSWORD = process.env.CLAPAY_TEST_ACCOUNT_PASSWORD;
const AMOUNT     = Number(process.env.TEST_AMOUNT ?? 500); // FCFA

const OK  = "\x1b[32m✓\x1b[0m";
const ERR = "\x1b[31m✗\x1b[0m";
const INF = "\x1b[36mℹ\x1b[0m";
const HDR = "\x1b[33m▶\x1b[0m";

async function run() {
  if (process.env.ALLOW_CLAPAY_LIVE_CHARGE !== "I_UNDERSTAND_THIS_CHARGES_REAL_MONEY") {
    throw new Error("Test bloqué : définissez explicitement ALLOW_CLAPAY_LIVE_CHARGE pour autoriser un vrai débit.");
  }
  if (!ACCOUNT_PHONE || !TARGET_PHONE || !ACCOUNT_PASSWORD) {
    throw new Error("Configurez CLAPAY_TEST_ACCOUNT_PHONE, CLAPAY_LIVE_TARGET_PHONE et CLAPAY_TEST_ACCOUNT_PASSWORD dans les secrets.");
  }

  console.log("\n══════════════════════════════════════════════");
  console.log("  Test Clapay LIVE — MTN Côte d'Ivoire");
  console.log("  Numéros et identifiants masqués.");
  console.log(`  Montant      : ${AMOUNT} FCFA`);
  console.log("══════════════════════════════════════════════");

  /* ── 1. Vérifier que le token Clapay est en DB ── */
  console.log(`\n${HDR} 1. Vérification du token Clapay en DB`);
  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "clapay_api_token")).limit(1);
  const token = rows[0]?.value?.trim();
  if (!token) { console.log(`  ${ERR} Token manquant`); process.exit(1); }
  console.log(`  ${OK} Token présent.`);

  const gateway = (await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "mobile_money_gateway")).limit(1))[0]?.value
    ?? process.env.MOBILE_MONEY_GATEWAY ?? "?";
  console.log(`  ${INF} Gateway actif : ${gateway}`);

  /* ── 2. Login via API server ── */
  console.log(`\n${HDR} 2. Login compte démo via API server`);
  let cookie = "";
  try {
    const loginRes = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: ACCOUNT_PHONE, password: ACCOUNT_PASSWORD }),
    });
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/simix_session=[^;]+/);
    cookie = match ? match[0] : "";
    const body = await loginRes.json() as any;
    if (!loginRes.ok || !cookie) {
      console.log(`  ${ERR} Login échoué : HTTP ${loginRes.status}`);
      process.exit(1);
    }
    console.log(`  ${OK} Connexion réussie.`);
  } catch (e) {
    console.log(`  ${ERR} Serveur inaccessible : ${(e as Error).message}`);
    process.exit(1);
  }

  /* ── 3. Initier la recharge via Clapay MTN CI ── */
  console.log(`\n${HDR} 3. Initiation recharge Clapay MTN CI`);

  const rechargePayload = {
    amount: AMOUNT,
    methodSlug: "mtn_money",
    countryCode: "CI",
    phoneNumber: TARGET_PHONE,    // configuré hors code et jamais affiché
    dialCode: "+225",
  };

  console.log(`  Recharge de ${AMOUNT} FCFA demandée; données personnelles masquées.`);

  let rechargeRes: Response;
  try {
    rechargeRes = await fetch(`${API}/wallet/recharge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(rechargePayload),
    });
  } catch (e) {
    console.log(`  ${ERR} Erreur réseau : ${(e as Error).message}`);
    process.exit(1);
  }

  const body = await rechargeRes.json() as any;

  if (!rechargeRes.ok) {
    console.log(`  ${ERR} HTTP ${rechargeRes.status}. Détails omis pour éviter toute fuite de données.`);
    process.exitCode = 1;
  } else {
    console.log(`  ${OK} \x1b[32mREQUÊTE ACCEPTÉE — HTTP ${rechargeRes.status}\x1b[0m`);
    if (body?.clapayPaymentUrl) {
      console.log(`\n  ${OK} URL de paiement reçue (valeur masquée).`);
    }
    if (body?.depositId) {
      console.log(`  ${INF} Référence de dépôt reçue (valeur masquée).`);
    }
  }

  console.log("\n══════════════════════════════════════════════\n");
}

run().catch(e => { console.error("\nErreur fatale :", e.message); process.exit(1); });
