/**
 * Test Clapay LIVE MTN Côte d'Ivoire
 * Passe par le serveur API local (port 8080) qui a accès réseau à api.clapay.net
 */
import { db, usersTable, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const API       = `http://localhost:${process.env.PORT ?? 8080}/api`;
const PHONE_CI  = "+2250595857098";   // numéro MTN CI à débiter
const DEMO_PHONE = "+2250701234567";
const DEMO_PASS  = "simix2026";
const AMOUNT     = Number(process.env.TEST_AMOUNT ?? 500); // FCFA

const OK  = "\x1b[32m✓\x1b[0m";
const ERR = "\x1b[31m✗\x1b[0m";
const INF = "\x1b[36mℹ\x1b[0m";
const HDR = "\x1b[33m▶\x1b[0m";

async function run() {
  console.log("\n══════════════════════════════════════════════");
  console.log("  Test Clapay LIVE — MTN Côte d'Ivoire");
  console.log(`  Numéro cible : ${PHONE_CI}`);
  console.log(`  Montant      : ${AMOUNT} FCFA`);
  console.log("══════════════════════════════════════════════");

  /* ── 1. Vérifier que le token Clapay est en DB ── */
  console.log(`\n${HDR} 1. Vérification du token Clapay en DB`);
  const rows = await db.select().from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "clapay_api_token")).limit(1);
  const token = rows[0]?.value?.trim();
  if (!token) { console.log(`  ${ERR} Token manquant`); process.exit(1); }
  console.log(`  ${OK} Token présent : ${token.slice(0, 16)}...`);

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
      body: JSON.stringify({ identifier: DEMO_PHONE, password: DEMO_PASS }),
    });
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/simix_session=[^;]+/);
    cookie = match ? match[0] : "";
    const body = await loginRes.json() as any;
    if (!loginRes.ok || !cookie) {
      console.log(`  ${ERR} Login échoué : HTTP ${loginRes.status} — ${JSON.stringify(body)}`);
      process.exit(1);
    }
    console.log(`  ${OK} Connecté : ${body.user?.fullName} — Solde : ${body.user?.balance?.toLocaleString("fr-FR")} FCFA`);
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
    phoneNumber: "0595857098",    // sans indicatif — le serveur ajoute +225
    dialCode: "+225",
  };

  console.log(`  Payload → ${JSON.stringify(rechargePayload)}`);

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
    console.log(`  ${ERR} HTTP ${rechargeRes.status} : ${JSON.stringify(body, null, 2)}`);
    process.exitCode = 1;
  } else {
    console.log(`  ${OK} \x1b[32mREQUÊTE ACCEPTÉE — HTTP ${rechargeRes.status}\x1b[0m`);
    console.log(`\n  Réponse complète :`);
    console.log(JSON.stringify(body, null, 2).split("\n").map(l => "    " + l).join("\n"));

    if (body?.clapayPaymentUrl) {
      console.log(`\n  ${OK} URL DE PAIEMENT : \x1b[36m${body.clapayPaymentUrl}\x1b[0m`);
    }
    if (body?.depositId) {
      console.log(`  ${INF} Deposit ID : ${body.depositId}`);
    }
  }

  console.log("\n══════════════════════════════════════════════\n");
}

run().catch(e => { console.error("\nErreur fatale :", e.message); process.exit(1); });
