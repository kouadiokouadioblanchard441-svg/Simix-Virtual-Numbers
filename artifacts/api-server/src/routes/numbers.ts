import { Router, type IRouter } from "express";
import { and, desc, eq, gt, sql, isNotNull } from "drizzle-orm";
import {
  db,
  countriesTable,
  servicesTable,
  smsMessagesTable,
  transactionsTable,
  usersTable,
  virtualNumbersTable,
  apiProvidersTable,
} from "@workspace/db";
import {
  GetNumberQuoteQueryParams,
  RequestNumberBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { toNumber, toMessage } from "../lib/serializers";
import { isRateLimited } from "../lib/rate-limiter";
import {
  assessPurchaseRisk,
  blockUser,
  logSecurityEvent,
} from "../lib/fraud-detection";
import { FiveSimClient, FiveSimError, ISO_TO_5SIM, SERVICE_TO_5SIM } from "../lib/fivesim";
import { logger } from "../lib/logger";
import { broadcastNotification } from "./notifications";
import { notificationsTable } from "@workspace/db";
import {
  getNumberValidityMinutes,
  getExtendMinutes,
  getExtendFee,
  getMaxOrdersPerMinute,
} from "../lib/settings";

const router: IRouter = Router();

/* ─── Helpers ─────────────────────────────────────────────────────── */

function extractCode(text: string): string | null {
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1]! : null;
}

async function getActive5SimClient(): Promise<FiveSimClient | null> {
  const providers = await db
    .select()
    .from(apiProvidersTable)
    .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
    .limit(1);
  if (!providers.length || !providers[0]?.apiKey) return null;
  return new FiveSimClient(providers[0].apiKey);
}

/* ─── Quote — with optional real-time 5sim availability ─────────── */
router.get("/numbers/quote", async (req, res): Promise<void> => {
  const parsed = GetNumberQuoteQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { serviceId, countryId } = parsed.data;

  /* Guard: validate UUID format before querying to avoid DB crashes */
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(serviceId) || !UUID_RE.test(countryId)) {
    res.status(404).json({ error: "Service ou pays introuvable" });
    return;
  }

  let service: typeof servicesTable.$inferSelect | undefined;
  let country: typeof countriesTable.$inferSelect | undefined;
  try {
    [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
    [country] = await db.select().from(countriesTable).where(eq(countriesTable.id, countryId)).limit(1);
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[quote] DB lookup failed");
    res.status(500).json({ error: "Erreur serveur, veuillez réessayer" });
    return;
  }

  if (!service || !country) {
    res.status(404).json({ error: "Service ou pays introuvable" });
    return;
  }

  /* availableQty = number of available numbers (from DB as default) */
  let availableQty: number = country.available;

  /* Try to get real-time availability from 5sim (non-blocking, 3s max) */
  try {
    const fiveSimClient = await getActive5SimClient();
    if (fiveSimClient) {
      const countrySlug = ISO_TO_5SIM[country.code.toUpperCase()];
      const productSlug = SERVICE_TO_5SIM[service.slug.toLowerCase()] ?? service.slug.toLowerCase();
      if (countrySlug && productSlug) {
        const info = await Promise.race([
          fiveSimClient.checkAvailability(countrySlug, productSlug),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 3_000)),
        ]);
        if (info !== null) {
          availableQty = info.qty;
          /* Update DB cache for next time */
          void db.update(countriesTable)
            .set({ available: info.qty })
            .where(eq(countriesTable.id, countryId))
            .catch(() => {});
        }
      }
    }
  } catch (e) {
    logger.debug({ err: (e as Error).message }, "[quote] 5sim availability check skipped");
  }

  const price = country.price;
  const validityMinutes = await getNumberValidityMinutes();
  res.json({
    service: {
      id: service.id,
      name: service.name,
      slug: service.slug,
      scope: service.scope,
      price: service.price,
      available: service.available,
      color: service.color,
      category: service.category,
      popular: service.popular,
    },
    country: {
      id: country.id,
      name: country.name,
      code: country.code,
      dialCode: country.dialCode,
      flag: country.flag,
      available: availableQty > 0,
      price: country.price,
      popular: country.popular,
    },
    available: availableQty,
    providerQty: availableQty,
    waitTime: "10 - 60 sec",
    price,
    fees: 0,
    total: price,
    validityMinutes,
  });
});

/* ─── Buy number ─────────────────────────────────────────────────── */
router.post("/numbers", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const ip = req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";

  /* Rate limiting — limit from system_settings (max_orders_per_minute) */
  const maxPerMin = await getMaxOrdersPerMinute();
  if (isRateLimited(`purchase_rate:${user.id}`, maxPerMin, 60_000)) {
    await logSecurityEvent({
      userId: user.id, eventType: "purchase_rate_limit", severity: "high",
      ip, userAgent: ua, riskScore: 70, details: { action: "buy_number" },
    });
    res.status(429).json({ error: "Trop d'achats en peu de temps. Attendez une minute." });
    return;
  }

  isRateLimited(`purchase:${user.id}`, 999, 3_600_000);
  isRateLimited(`purchase_ip:${ip}`, 999, 60_000);
  const risk = await assessPurchaseRisk(user.id, ip);

  if (risk.level === "dangerous") {
    await logSecurityEvent({
      userId: user.id, eventType: "fraud_purchase_blocked", severity: "critical",
      ip, userAgent: ua, riskScore: risk.score, details: { reasons: risk.reasons },
    });
    await blockUser(user.id, `Activité frauduleuse: ${risk.reasons.join(", ")}`);
    res.status(403).json({ error: "Activité suspecte détectée. Compte suspendu. Contactez le support." });
    return;
  }

  if (risk.level === "suspicious") {
    await logSecurityEvent({
      userId: user.id, eventType: "purchase_suspicious", severity: "medium",
      ip, userAgent: ua, riskScore: risk.score, details: { reasons: risk.reasons },
    });
    await db.update(usersTable)
      .set({ riskScore: sql`LEAST(${usersTable.riskScore} + ${risk.score}, 100)` })
      .where(eq(usersTable.id, user.id));
  }

  const parsed = RequestNumberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { serviceId, countryId } = parsed.data;
  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
  const [country] = await db.select().from(countriesTable).where(eq(countriesTable.id, countryId)).limit(1);

  if (!service || !country) {
    res.status(404).json({ error: "Service ou pays introuvable" });
    return;
  }

  /* Check if service is enabled */
  if (service.enabled === false) {
    res.status(400).json({ error: `Le service ${service.name} est temporairement désactivé.` });
    return;
  }

  /* Check if country is available */
  if (!country.available) {
    res.status(400).json({ error: `Le pays ${country.name} n'est pas disponible pour le moment.` });
    return;
  }

  const price = country.price;
  if (user.balance < price) {
    res.status(402).json({ error: "Solde insuffisant. Rechargez votre portefeuille." });
    return;
  }

  /* Deduct balance atomically */
  const [updatedUser] = await db
    .update(usersTable)
    .set({ balance: user.balance - price })
    .where(and(eq(usersTable.id, user.id), gt(usersTable.balance, price - 1)))
    .returning();

  if (!updatedUser) {
    res.status(402).json({ error: "Solde insuffisant. Veuillez réessayer." });
    return;
  }

  const externalOrderId: string | null = null;
  const validityMin = await getNumberValidityMinutes();
  const expiresAt = new Date(Date.now() + validityMin * 60 * 1000);

  /* ── Appel réel à 5sim (aucun fallback vers numéros fictifs) ── */
  const fiveSimClient = await getActive5SimClient();

  if (!fiveSimClient) {
    /* 5sim non configuré — rembourser et refuser */
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${price}` })
      .where(eq(usersTable.id, user.id));
    res.status(503).json({ error: "Service momentanément indisponible. Veuillez contacter le support." });
    return;
  }

  const countrySlug = ISO_TO_5SIM[country.code.toUpperCase()];
  const productSlug = SERVICE_TO_5SIM[service.slug.toLowerCase()] ?? service.slug.toLowerCase();

  if (!countrySlug || !productSlug) {
    /* Pas de correspondance 5sim pour ce pays/service — rembourser */
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${price}` })
      .where(eq(usersTable.id, user.id));
    logger.warn({ countryCode: country.code, serviceSlug: service.slug }, "[5sim] No mapping found");
    res.status(503).json({ error: "Service momentanément indisponible. Veuillez contacter le support." });
    return;
  }

  let phoneNumber: string;
  try {
    const order = await fiveSimClient.buyNumber(countrySlug, "any", productSlug);
    phoneNumber = order.phone;
    logger.info(
      { orderId: order.id, phone: phoneNumber, userId: user.id, countrySlug, productSlug },
      "[5sim] Real number acquired",
    );
  } catch (e) {
    const errMsg = (e as Error).message;
    const is5SimErr = e instanceof FiveSimError;

    /* Toujours rembourser l'utilisateur en cas d'échec */
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${price}` })
      .where(eq(usersTable.id, user.id));

    if (is5SimErr && (e as FiveSimError).isPaymentRequired) {
      logger.warn({ countrySlug, productSlug }, "[5sim] Account balance exhausted");
      res.status(503).json({ error: "Service momentanément indisponible. Veuillez contacter le support." });
    } else if (is5SimErr && (e as FiveSimError).isNoNumbers) {
      logger.warn({ countrySlug, productSlug }, "[5sim] No numbers available");
      res.status(503).json({ error: "Aucun numéro disponible pour ce pays/service actuellement. Veuillez réessayer ou contacter le support." });
    } else {
      logger.error({ error: errMsg, countrySlug, productSlug }, "[5sim] API error");
      res.status(503).json({ error: "Service momentanément indisponible. Veuillez contacter le support." });
    }
    return;
  }

  /* ── Persist virtual number ── */
  const [vn] = await db.insert(virtualNumbersTable).values({
    userId: user.id,
    serviceId: service.id,
    countryId: country.id,
    phoneNumber,
    status: "waiting",
    price,
    expiresAt,
    externalOrderId,
  }).returning();

  if (!vn) {
    /* Roll back balance */
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${price}` })
      .where(eq(usersTable.id, user.id));
    res.status(500).json({ error: "Erreur lors de la création du numéro" });
    return;
  }

  /* ── Log transaction ── */
  await db.insert(transactionsTable).values({
    userId: user.id,
    type: "purchase",
    amount: price,
    status: "completed",
    method: "wallet",
    description: `${service.name} – ${country.name} (5sim)`,
  });

  /* ── Push real-time purchase notification ── */
  try {
    const [notif] = await db.insert(notificationsTable).values({
      userId: user.id,
      title: "📱 Numéro attribué",
      body: `Votre numéro ${service.name} (${country.name}) est prêt. En attente de SMS...`,
      type: "purchase",
      icon: "phone",
      link: `/numbers/${vn!.id}`,
      metadata: { numberId: vn!.id, service: service.name, country: country.name, price },
    }).returning();
    if (notif) broadcastNotification(notif);
  } catch { /* non-critical */ }

  res.json(toNumber(vn, service, country, []));
});

/* ─── Active numbers ──────────────────────────────────────────────── */
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
    rows.map(async r => {
      const messages = await db
        .select()
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.numberId, r.n.id))
        .orderBy(desc(smsMessagesTable.receivedAt));
      return toNumber(r.n, r.s, r.c, messages);
    }),
  );
  res.json(result);
});

/* ─── History ────────────────────────────────────────────────────── */
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
    rows.map(async r => {
      const messages = await db
        .select()
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.numberId, r.n.id))
        .orderBy(desc(smsMessagesTable.receivedAt));
      return toNumber(r.n, r.s, r.c, messages);
    }),
  );
  res.json(result);
});

/* ─── Single number ──────────────────────────────────────────────── */
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

  /* Auto-expire if past due */
  if (row.n.expiresAt.getTime() < Date.now() && row.n.status === "waiting") {
    await db
      .update(virtualNumbersTable)
      .set({ status: "expired" })
      .where(eq(virtualNumbersTable.id, numberId));
    row.n.status = "expired";
  }

  const messages = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, numberId))
    .orderBy(desc(smsMessagesTable.receivedAt));

  res.json(toNumber(row.n, row.s, row.c, messages));
});

/* ─── Poll SMS from 5sim (on-demand) ────────────────────────────── */
router.post("/numbers/:numberId/poll", requireAuth, async (req, res): Promise<void> => {
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

  /* Only poll if there's a real 5sim order */
  if (row.n.externalOrderId) {
    const fiveSimClient = await getActive5SimClient();
    if (fiveSimClient) {
      try {
        const order = await fiveSimClient.checkOrder(Number(row.n.externalOrderId));

        /* Save any new SMS */
        if (order.sms && order.sms.length > 0) {
          const existingMessages = await db
            .select({ body: smsMessagesTable.body })
            .from(smsMessagesTable)
            .where(eq(smsMessagesTable.numberId, numberId));
          const existingBodies = new Set(existingMessages.map(m => m.body));

          for (const sms of order.sms) {
            if (!existingBodies.has(sms.text)) {
              await db.insert(smsMessagesTable).values({
                numberId,
                sender: sms.sender || "Unknown",
                body: sms.text,
                code: sms.code || extractCode(sms.text) || "",
              });
            }
          }
        }

        /* Update status if SMS received */
        if (
          (order.sms && order.sms.length > 0) ||
          order.status === "RECEIVED" ||
          order.status === "FINISHED"
        ) {
          await db
            .update(virtualNumbersTable)
            .set({ status: "received" })
            .where(eq(virtualNumbersTable.id, numberId));

          /* Mark as finished on 5sim if still RECEIVED */
          if (order.status === "RECEIVED") {
            try {
              await fiveSimClient.finishOrder(Number(row.n.externalOrderId));
            } catch (e) {
              logger.debug({ err: (e as Error).message }, "[poll] finishOrder skipped");
            }
          }
        }

        /* Handle expired/cancelled by provider */
        if (order.status === "TIMEOUT") {
          await db
            .update(virtualNumbersTable)
            .set({ status: "expired", expiresAt: new Date() })
            .where(eq(virtualNumbersTable.id, numberId));
        }
      } catch (e) {
        logger.warn(
          { error: (e as Error).message, orderId: row.n.externalOrderId },
          "[poll] 5sim checkOrder failed",
        );
      }
    }
  }

  const messages = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, numberId))
    .orderBy(desc(smsMessagesTable.receivedAt));

  res.json(messages.map(toMessage));
});

/* ─── Messages ───────────────────────────────────────────────────── */
router.get("/numbers/:numberId/messages", requireAuth, async (req, res): Promise<void> => {
  const numberId = String(req.params.numberId);
  const user = req.user!;

  const [vn] = await db
    .select()
    .from(virtualNumbersTable)
    .where(and(eq(virtualNumbersTable.id, numberId), eq(virtualNumbersTable.userId, user.id)))
    .limit(1);

  if (!vn) { res.status(404).json({ error: "Numéro introuvable" }); return; }

  const messages = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, numberId))
    .orderBy(desc(smsMessagesTable.receivedAt));

  res.json(messages.map(toMessage));
});

/* ─── Extend ─────────────────────────────────────────────────────── */
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
  if (row.n.status === "received") { res.status(400).json({ error: "Ce numéro a déjà reçu un SMS" }); return; }

  const extendFee = await getExtendFee();
  const extendMinutes = await getExtendMinutes();

  if (user.balance < extendFee) { res.status(402).json({ error: `Solde insuffisant (${extendFee} FCFA requis)` }); return; }

  await db.update(usersTable)
    .set({ balance: sql`${usersTable.balance} - ${extendFee}` })
    .where(eq(usersTable.id, user.id));

  const newExpiresAt = new Date(
    Math.max(row.n.expiresAt.getTime(), Date.now()) + extendMinutes * 60 * 1000,
  );

  const [updated] = await db
    .update(virtualNumbersTable)
    .set({
      expiresAt: newExpiresAt,
      status: row.n.status === "expired" ? "waiting" : row.n.status,
    })
    .where(eq(virtualNumbersTable.id, numberId))
    .returning();

  await db.insert(transactionsTable).values({
    userId: user.id,
    type: "purchase",
    amount: extendFee,
    status: "completed",
    method: "wallet",
    description: `Prolongation +${extendMinutes} min`,
  });

  const messages = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, numberId))
    .orderBy(desc(smsMessagesTable.receivedAt));

  res.json(toNumber(updated!, row.s, row.c, messages));
});

/* ─── Cancel ─────────────────────────────────────────────────────── */
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
  if (row.n.status === "cancelled") { res.status(400).json({ error: "Numéro déjà annulé" }); return; }

  const messages = await db
    .select()
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, numberId));

  /* Cancel on 5sim only if no SMS received yet */
  if (row.n.externalOrderId && messages.length === 0) {
    const fiveSimClient = await getActive5SimClient();
    if (fiveSimClient) {
      try {
        await fiveSimClient.cancelOrder(Number(row.n.externalOrderId));
        logger.info({ orderId: row.n.externalOrderId }, "[5sim] Order cancelled by user");
      } catch (e) {
        logger.warn({ error: (e as Error).message }, "[5sim] Cancel failed (non-critical)");
      }
    }
  }

  /* Refund only if no SMS was received */
  if (messages.length === 0 && row.n.status !== "cancelled") {
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${row.n.price}` })
      .where(eq(usersTable.id, user.id));

    await db.insert(transactionsTable).values({
      userId: user.id,
      type: "refund",
      amount: row.n.price,
      status: "completed",
      method: "wallet",
      description: `Remboursement – ${row.s.name} (${row.c.name})`,
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
