import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  countriesTable,
  servicesTable,
  smsMessagesTable,
  transactionsTable,
  usersTable,
  virtualNumbersTable,
} from "@workspace/db";
import {
  GetNumberQuoteQueryParams,
  RequestNumberBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { toNumber, toMessage } from "../lib/serializers";
import { scheduleSimulatedSms } from "../lib/sms-simulator";
import { isRateLimited } from "../lib/rate-limiter";
import {
  assessPurchaseRisk,
  blockUser,
  logSecurityEvent,
} from "../lib/fraud-detection";

const router: IRouter = Router();

const VALIDITY_MINUTES = 15;
const EXTEND_MINUTES = 5;
const EXTEND_FEE = 30;

function generatePhoneNumber(dialCode: string): string {
  const digits = "0123456789";
  let suffix = "";
  for (let i = 0; i < 9; i++) suffix += digits[Math.floor(Math.random() * digits.length)];
  const grouped = suffix.match(/.{1,2}/g)?.join(" ") ?? suffix;
  return `${dialCode} ${grouped}`;
}

/* ─── Quote ─── */
router.get("/numbers/quote", async (req, res): Promise<void> => {
  const parsed = GetNumberQuoteQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { serviceId, countryId } = parsed.data;
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  const [country] = await db.select().from(countriesTable).where(eq(countriesTable.id, countryId)).limit(1);

  if (!service || !country) { res.status(404).json({ error: "Service ou pays introuvable" }); return; }

  const price = country.price;
  res.json({
    service: { id: service.id, name: service.name, slug: service.slug, scope: service.scope, price: service.price, available: service.available, color: service.color, category: service.category, popular: service.popular },
    country: { id: country.id, name: country.name, code: country.code, dialCode: country.dialCode, flag: country.flag, available: country.available, price: country.price, popular: country.popular },
    available: country.available,
    waitTime: "20 - 60 sec",
    price,
    fees: 0,
    total: price,
    validityMinutes: VALIDITY_MINUTES,
  });
});

/* ─── Buy number — with fraud detection ─── */
router.post("/numbers", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const ip = req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";

  /* ── 10 purchases per minute per user ── */
  if (isRateLimited(`purchase_rate:${user.id}`, 10, 60_000)) {
    await logSecurityEvent({
      userId: user.id,
      eventType: "purchase_rate_limit",
      severity: "high",
      ip,
      userAgent: ua,
      riskScore: 70,
      details: { action: "buy_number" },
    });
    res.status(429).json({ error: "Trop d'achats en peu de temps. Attendez une minute." });
    return;
  }

  /* ── Fraud risk assessment ── */
  isRateLimited(`purchase:${user.id}`, 999, 3_600_000);   // record for hourly counter
  isRateLimited(`purchase_ip:${ip}`, 999, 60_000);         // record for IP counter
  const risk = await assessPurchaseRisk(user.id, ip);

  if (risk.level === "dangerous") {
    await logSecurityEvent({
      userId: user.id,
      eventType: "fraud_purchase_blocked",
      severity: "critical",
      ip,
      userAgent: ua,
      riskScore: risk.score,
      details: { reasons: risk.reasons },
    });
    await blockUser(user.id, `Activité frauduleuse détectée: ${risk.reasons.join(", ")}`);
    res.status(403).json({
      error: "Activité suspecte détectée. Compte suspendu. Contactez le support.",
    });
    return;
  }

  if (risk.level === "suspicious") {
    await logSecurityEvent({
      userId: user.id,
      eventType: "purchase_suspicious",
      severity: "medium",
      ip,
      userAgent: ua,
      riskScore: risk.score,
      details: { reasons: risk.reasons },
    });
    /* Update user risk score */
    await db
      .update(usersTable)
      .set({ riskScore: sql`LEAST(${usersTable.riskScore} + ${risk.score}, 100)` })
      .where(eq(usersTable.id, user.id));
  }

  const parsed = RequestNumberBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { serviceId, countryId } = parsed.data;

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  const [country] = await db.select().from(countriesTable).where(eq(countriesTable.id, countryId)).limit(1);

  if (!service || !country) { res.status(404).json({ error: "Service ou pays introuvable" }); return; }

  const price = country.price;
  if (user.balance < price) {
    res.status(402).json({ error: "Solde insuffisant. Rechargez votre portefeuille." });
    return;
  }

  const [updatedUser] = await db
    .update(usersTable)
    .set({ balance: user.balance - price })
    .where(eq(usersTable.id, user.id))
    .returning();

  if (!updatedUser) { res.status(500).json({ error: "Erreur lors du paiement" }); return; }

  const phoneNumber = generatePhoneNumber(country.dialCode);
  const expiresAt = new Date(Date.now() + VALIDITY_MINUTES * 60 * 1000);

  const [vn] = await db
    .insert(virtualNumbersTable)
    .values({ userId: user.id, serviceId: service.id, countryId: country.id, phoneNumber, status: "waiting", price, expiresAt })
    .returning();

  if (!vn) { res.status(500).json({ error: "Erreur création du numéro" }); return; }

  await db.insert(transactionsTable).values({
    userId: user.id,
    type: "purchase",
    amount: price,
    status: "completed",
    method: "wallet",
    description: `Numéro ${service.name} - ${country.name}`,
  });

  scheduleSimulatedSms(vn.id, service.name);
  res.json(toNumber(vn, service, country, []));
});

/* ─── Active numbers ─── */
router.get("/numbers/active", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db
    .select({ n: virtualNumbersTable, s: servicesTable, c: countriesTable })
    .from(virtualNumbersTable)
    .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .innerJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(and(eq(virtualNumbersTable.userId, user.id), gt(virtualNumbersTable.expiresAt, new Date())))
    .orderBy(desc(virtualNumbersTable.createdAt));

  const result = await Promise.all(
    rows.map(async (r) => {
      const messages = await db.select().from(smsMessagesTable).where(eq(smsMessagesTable.numberId, r.n.id)).orderBy(desc(smsMessagesTable.receivedAt));
      return toNumber(r.n, r.s, r.c, messages);
    }),
  );
  res.json(result);
});

/* ─── History ─── */
router.get("/numbers/history", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const rows = await db
    .select({ n: virtualNumbersTable, s: servicesTable, c: countriesTable })
    .from(virtualNumbersTable)
    .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .innerJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(eq(virtualNumbersTable.userId, user.id))
    .orderBy(desc(virtualNumbersTable.createdAt))
    .limit(100);

  const result = await Promise.all(
    rows.map(async (r) => {
      const messages = await db.select().from(smsMessagesTable).where(eq(smsMessagesTable.numberId, r.n.id)).orderBy(desc(smsMessagesTable.receivedAt));
      return toNumber(r.n, r.s, r.c, messages);
    }),
  );
  res.json(result);
});

/* ─── Single number ─── */
router.get("/numbers/:numberId", requireAuth, async (req, res): Promise<void> => {
  const numberId = String(req.params.numberId);
  const user = req.user!;

  const [row] = await db
    .select({ n: virtualNumbersTable, s: servicesTable, c: countriesTable })
    .from(virtualNumbersTable)
    .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .innerJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(and(eq(virtualNumbersTable.id, numberId), eq(virtualNumbersTable.userId, user.id)))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Numéro introuvable" }); return; }

  if (row.n.expiresAt.getTime() < Date.now() && row.n.status === "waiting") {
    await db.update(virtualNumbersTable).set({ status: "expired" }).where(eq(virtualNumbersTable.id, numberId));
    row.n.status = "expired";
  }

  const messages = await db.select().from(smsMessagesTable).where(eq(smsMessagesTable.numberId, numberId)).orderBy(desc(smsMessagesTable.receivedAt));
  res.json(toNumber(row.n, row.s, row.c, messages));
});

/* ─── Messages ─── */
router.get("/numbers/:numberId/messages", requireAuth, async (req, res): Promise<void> => {
  const numberId = String(req.params.numberId);
  const user = req.user!;

  const [vn] = await db.select().from(virtualNumbersTable).where(and(eq(virtualNumbersTable.id, numberId), eq(virtualNumbersTable.userId, user.id))).limit(1);
  if (!vn) { res.status(404).json({ error: "Numéro introuvable" }); return; }

  const messages = await db.select().from(smsMessagesTable).where(eq(smsMessagesTable.numberId, numberId)).orderBy(desc(smsMessagesTable.receivedAt));
  res.json(messages.map(toMessage));
});

/* ─── Extend ─── */
router.post("/numbers/:numberId/extend", requireAuth, async (req, res): Promise<void> => {
  const numberId = String(req.params.numberId);
  const user = req.user!;

  const [row] = await db
    .select({ n: virtualNumbersTable, s: servicesTable, c: countriesTable })
    .from(virtualNumbersTable)
    .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .innerJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(and(eq(virtualNumbersTable.id, numberId), eq(virtualNumbersTable.userId, user.id)))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Numéro introuvable" }); return; }
  if (user.balance < EXTEND_FEE) { res.status(402).json({ error: "Solde insuffisant pour prolonger" }); return; }

  await db.update(usersTable).set({ balance: sql`${usersTable.balance} - ${EXTEND_FEE}` }).where(eq(usersTable.id, user.id));
  const newExpiresAt = new Date(Math.max(row.n.expiresAt.getTime(), Date.now()) + EXTEND_MINUTES * 60 * 1000);

  const [updated] = await db
    .update(virtualNumbersTable)
    .set({ expiresAt: newExpiresAt, status: row.n.status === "expired" ? "waiting" : row.n.status })
    .where(eq(virtualNumbersTable.id, numberId))
    .returning();

  await db.insert(transactionsTable).values({
    userId: user.id, type: "purchase", amount: EXTEND_FEE, status: "completed", method: "wallet",
    description: `Prolongation +${EXTEND_MINUTES} min`,
  });

  const messages = await db.select().from(smsMessagesTable).where(eq(smsMessagesTable.numberId, numberId)).orderBy(desc(smsMessagesTable.receivedAt));
  res.json(toNumber(updated!, row.s, row.c, messages));
});

/* ─── Cancel ─── */
router.post("/numbers/:numberId/cancel", requireAuth, async (req, res): Promise<void> => {
  const numberId = String(req.params.numberId);
  const user = req.user!;

  const [row] = await db
    .select({ n: virtualNumbersTable, s: servicesTable, c: countriesTable })
    .from(virtualNumbersTable)
    .innerJoin(servicesTable, eq(virtualNumbersTable.serviceId, servicesTable.id))
    .innerJoin(countriesTable, eq(virtualNumbersTable.countryId, countriesTable.id))
    .where(and(eq(virtualNumbersTable.id, numberId), eq(virtualNumbersTable.userId, user.id)))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Numéro introuvable" }); return; }

  const messages = await db.select().from(smsMessagesTable).where(eq(smsMessagesTable.numberId, numberId));

  if (messages.length === 0 && row.n.status !== "cancelled") {
    await db.update(usersTable).set({ balance: sql`${usersTable.balance} + ${row.n.price}` }).where(eq(usersTable.id, user.id));
    await db.insert(transactionsTable).values({
      userId: user.id, type: "refund", amount: row.n.price, status: "completed", method: "wallet",
      description: `Remboursement ${row.s.name} - ${row.c.name}`,
    });
  }

  const [updated] = await db
    .update(virtualNumbersTable)
    .set({ status: "cancelled", expiresAt: new Date() })
    .where(eq(virtualNumbersTable.id, numberId))
    .returning();

  res.json(toNumber(updated!, row.s, row.c, messages));
});

export default router;
