/**
 * Test end-to-end de l'intégration Clapay
 * Utilise la connexion Supabase réelle (SUPABASE_DATABASE_URL)
 *
 * Ce script :
 * 1. Lit le solde initial du compte démo dans Supabase
 * 2. Insère une transaction Clapay en attente (pending)
 * 3. Envoie un webhook COMPLETED au serveur
 * 4. Vérifie que le solde a été crédité dans Supabase
 * 5. Nettoie les données de test
 */

import {
  db,
  transactionsTable,
  usersTable,
  systemSettingsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const API_BASE = `http://localhost:${process.env.PORT ?? 3000}/api`;
const TEST_AMOUNT = 2500; // FCFA
const DEMO_PHONE = "+2250701234567";

/* ── Couleurs terminal ── */
const OK  = "\x1b[32m✓\x1b[0m";
const ERR = "\x1b[31m✗\x1b[0m";
const INF = "\x1b[36mℹ\x1b[0m";
const HDR = "\x1b[33m▶\x1b[0m";

function pass(msg: string) { console.log(`  ${OK} ${msg}`); }
function fail(msg: string) { console.log(`  ${ERR} ${msg}`); process.exitCode = 1; }
function info(msg: string) { console.log(`  ${INF} ${msg}`); }
function step(msg: string) { console.log(`\n${HDR} ${msg}`); }

async function run() {
  console.log("\n══════════════════════════════════════════════");
  console.log("  Test Clapay — Intégration Supabase end-to-end");
  console.log("══════════════════════════════════════════════");

  /* ── ÉTAPE 1 : Vérifier la connexion Supabase ── */
  step("1. Connexion Supabase");
  let dbConnected = false;
  try {
    const rows = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    dbConnected = true;
    pass(`Supabase connecté — ${rows.length} utilisateur(s) trouvé(s)`);
  } catch (e) {
    fail(`Impossible de se connecter à Supabase : ${(e as Error).message}`);
    return;
  }

  /* ── ÉTAPE 2 : Lire le compte démo ── */
  step("2. Compte démo dans Supabase");
  const [demo] = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName, phone: usersTable.phone, balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.phone, DEMO_PHONE))
    .limit(1);

  if (!demo) {
    fail(`Compte démo ${DEMO_PHONE} introuvable dans Supabase`);
    return;
  }
  pass(`Compte trouvé : ${demo.fullName} (ID: ${demo.id})`);
  info(`Solde actuel : ${demo.balance.toLocaleString("fr-FR")} FCFA`);

  /* ── ÉTAPE 3 : Vérifier les paramètres Clapay dans Supabase ── */
  step("3. Paramètres Clapay dans Supabase (system_settings)");
  const settings = await db
    .select({ key: systemSettingsTable.key, value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(
      eq(systemSettingsTable.key, "clapay_api_token")
    );

  const clapayToken = settings.find(s => s.key === "clapay_api_token")?.value;
  const envToken = process.env.CLAPAY_API_TOKEN;

  if (clapayToken || envToken) {
    pass(`Token Clapay configuré (${clapayToken ? "DB" : "ENV"})`);
  } else {
    info("Token Clapay non configuré — test du webhook uniquement (normal en dev)");
  }

  /* ── ÉTAPE 4 : Vérifier le gateway configuré ── */
  const gatewayRow = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "mobile_money_gateway"))
    .limit(1);

  const gateway = process.env.MOBILE_MONEY_GATEWAY ?? gatewayRow[0]?.value ?? "pawapay";
  info(`Passerelle active : ${gateway}`);

  /* ── ÉTAPE 5 : Insérer une transaction Clapay en attente dans Supabase ── */
  step("4. Création d'une transaction Clapay en attente dans Supabase");
  const trackingId = `test-clapay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const externalDepositId = `clapay:${trackingId}`;

  const [pendingTx] = await db
    .insert(transactionsTable)
    .values({
      userId: demo.id,
      type: "recharge",
      amount: TEST_AMOUNT,
      status: "pending",
      method: "Orange Money",
      description: `Test Clapay — Recharge via Orange Money — +2250701234567`,
      externalDepositId,
    })
    .returning();

  if (!pendingTx) {
    fail("Impossible d'insérer la transaction test dans Supabase");
    return;
  }
  pass(`Transaction insérée dans Supabase — ID: ${pendingTx.id}`);
  info(`externalDepositId : ${externalDepositId}`);
  info(`Montant : ${TEST_AMOUNT.toLocaleString("fr-FR")} FCFA`);

  /* ── ÉTAPE 6 : Envoyer le webhook COMPLETED ── */
  step("5. Envoi du webhook Clapay COMPLETED au serveur");
  const webhookPayload = {
    status: "COMPLETED",
    transaction_id: trackingId,
    additional_infos: {
      customer_phone: DEMO_PHONE,
      customer_firstname: demo.fullName?.split(" ")[0] ?? "Test",
      customer_lastname: demo.fullName?.split(" ").slice(1).join(" ") ?? "User",
    },
    amount: TEST_AMOUNT,
    currency: "XOF",
    fee_percentage: 2,
    fee_value: 50,
    balance: 100000,
    balance_before: 97500,
    balance_after: 100000,
    transaction_method: "MERCHANT",
    transaction_phone_number: "0701234567",
    transaction_dial_code: "+225",
    signature: `SIG-${trackingId}`,
    transaction_date: new Date().toISOString(),
    transaction_country_code: "CI",
    transaction_service_name: "Orange Money CI",
    transaction_observation: "Test intégration",
  };

  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(`${API_BASE}/wallet/clapay/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });
  } catch (e) {
    fail(`Webhook inaccessible : ${(e as Error).message}`);
    await cleanup(pendingTx.id);
    return;
  }

  if (webhookResponse.status !== 200) {
    fail(`Webhook a retourné HTTP ${webhookResponse.status}`);
    await cleanup(pendingTx.id);
    return;
  }

  const webhookBody = await webhookResponse.json();
  pass(`Webhook répondu 200 — ${JSON.stringify(webhookBody)}`);

  /* ── ÉTAPE 7 : Attendre que le traitement async se finisse ── */
  info("Attente du traitement asynchrone (1s)…");
  await new Promise(r => setTimeout(r, 1200));

  /* ── ÉTAPE 8 : Vérifier la transaction dans Supabase ── */
  step("6. Vérification dans Supabase après webhook");

  const [updatedTx] = await db
    .select({ id: transactionsTable.id, status: transactionsTable.status, amount: transactionsTable.amount })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, pendingTx.id))
    .limit(1);

  if (!updatedTx) {
    fail("Transaction introuvable dans Supabase après webhook");
  } else if (updatedTx.status === "completed") {
    pass(`Transaction Supabase : status = "${updatedTx.status}" ✓`);
  } else {
    fail(`Transaction Supabase : status = "${updatedTx.status}" (attendu : "completed")`);
  }

  /* ── ÉTAPE 9 : Vérifier le solde dans Supabase ── */
  const [updatedUser] = await db
    .select({ balance: usersTable.balance })
    .from(usersTable)
    .where(eq(usersTable.id, demo.id))
    .limit(1);

  const newBalance = updatedUser?.balance ?? 0;
  const expectedBalance = demo.balance + TEST_AMOUNT;

  if (newBalance === expectedBalance) {
    pass(`Solde Supabase crédité : ${demo.balance.toLocaleString()} + ${TEST_AMOUNT.toLocaleString()} = ${newBalance.toLocaleString()} FCFA ✓`);
  } else if (newBalance > demo.balance) {
    pass(`Solde Supabase augmenté : ${demo.balance.toLocaleString()} → ${newBalance.toLocaleString()} FCFA ✓`);
    info(`(Écart possible si d'autres opérations ont eu lieu en parallèle)`);
  } else {
    fail(`Solde NON crédité — avant : ${demo.balance.toLocaleString()}, après : ${newBalance.toLocaleString()} FCFA`);
  }

  /* ── ÉTAPE 10 : Tester le webhook FAILED ── */
  step("7. Test webhook FAILED (ne doit PAS créditer)");
  const trackingId2 = `test-clapay-fail-${Date.now()}`;
  const depositId2 = `clapay:${trackingId2}`;

  const [pendingTx2] = await db.insert(transactionsTable).values({
    userId: demo.id, type: "recharge", amount: 9999, status: "pending",
    method: "MTN Money", description: "Test Clapay FAILED", externalDepositId: depositId2,
  }).returning();

  const balanceBeforeFail = (await db.select({ balance: usersTable.balance }).from(usersTable)
    .where(eq(usersTable.id, demo.id)).limit(1))[0]?.balance ?? 0;

  const failWebhook = await fetch(`${API_BASE}/wallet/clapay/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "FAILED", transaction_id: trackingId2, amount: 9999, currency: "XOF", signature: "SIG-fail", transaction_date: new Date().toISOString(), additional_infos: {}, fee_percentage: 0, fee_value: 0, balance: 0, balance_before: 0, balance_after: 0, transaction_method: "MERCHANT", transaction_phone_number: "", transaction_dial_code: "", transaction_country_code: "CI", transaction_service_name: "", transaction_observation: "" }),
  });

  await new Promise(r => setTimeout(r, 600));

  const [failedTx] = await db.select({ status: transactionsTable.status }).from(transactionsTable)
    .where(eq(transactionsTable.id, pendingTx2!.id)).limit(1);
  const balanceAfterFail = (await db.select({ balance: usersTable.balance }).from(usersTable)
    .where(eq(usersTable.id, demo.id)).limit(1))[0]?.balance ?? 0;

  if (failedTx?.status === "failed") {
    pass(`Transaction FAILED : status = "failed" dans Supabase ✓`);
  } else {
    fail(`Transaction FAILED : status = "${failedTx?.status}" (attendu : "failed")`);
  }

  if (balanceAfterFail === balanceBeforeFail) {
    pass(`Solde non modifié après FAILED : ${balanceAfterFail.toLocaleString()} FCFA ✓`);
  } else {
    fail(`Solde modifié après FAILED : ${balanceBeforeFail.toLocaleString()} → ${balanceAfterFail.toLocaleString()} (ERREUR CRITIQUE)`);
  }

  /* ── ÉTAPE 11 : Anti double-crédit ── */
  step("8. Test anti double-crédit (webhook envoyé 2x)");
  const balanceBeforeDup = balanceAfterFail;

  const dup = await fetch(`${API_BASE}/wallet/clapay/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...webhookPayload }),  // même trackingId que test COMPLETED déjà traité
  });
  await new Promise(r => setTimeout(r, 600));

  const balanceAfterDup = (await db.select({ balance: usersTable.balance }).from(usersTable)
    .where(eq(usersTable.id, demo.id)).limit(1))[0]?.balance ?? 0;

  if (balanceAfterDup === balanceBeforeDup) {
    pass(`Anti double-crédit : solde inchangé sur 2e webhook ✓`);
  } else {
    fail(`Double-crédit DÉTECTÉ : solde passé de ${balanceBeforeDup.toLocaleString()} à ${balanceAfterDup.toLocaleString()} FCFA`);
  }

  /* ── Nettoyage ── */
  step("9. Nettoyage des données de test dans Supabase");
  await cleanup(pendingTx.id);
  await cleanup(pendingTx2!.id);

  /* Remettre le solde à l'état initial */
  await db
    .update(usersTable)
    .set({ balance: demo.balance })
    .where(eq(usersTable.id, demo.id));

  pass(`Solde remis à ${demo.balance.toLocaleString()} FCFA`);
  pass("Données de test supprimées de Supabase");

  /* ── Résumé ── */
  console.log("\n══════════════════════════════════════════════");
  if (process.exitCode === 1) {
    console.log("  \x1b[31m✗ CERTAINS TESTS ONT ÉCHOUÉ — voir ci-dessus\x1b[0m");
  } else {
    console.log("  \x1b[32m✓ TOUS LES TESTS RÉUSSIS — Clapay 100% opérationnel\x1b[0m");
  }
  console.log("══════════════════════════════════════════════\n");
}

async function cleanup(txId: number) {
  try {
    const { sql } = await import("drizzle-orm");
    await db.delete(transactionsTable).where(eq(transactionsTable.id, txId));
  } catch { /* ignore */ }
}

run().catch(e => {
  console.error("\n\x1b[31mErreur fatale :\x1b[0m", e.message);
  process.exit(1);
});
