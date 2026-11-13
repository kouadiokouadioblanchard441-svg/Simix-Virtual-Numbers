/**
 * 5sim Background Poller
 *
 * Gère deux types de numéros :
 *   - activation : one-shot, poll via checkOrder(), finish après le premier SMS
 *   - hosting     : location longue durée (1day/3hours), poll via getSmsInbox(),
 *                   reste actif jusqu'à expiration, peut recevoir plusieurs SMS
 *
 * Intervalle : 15s normal, 60s après erreur réseau/DB.
 */

import { and, eq, gt, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  db,
  virtualNumbersTable,
  smsMessagesTable,
  usersTable,
  transactionsTable,
  apiProvidersTable,
  notificationsTable,
} from "@workspace/db";
import { FiveSimClient, FiveSimError } from "./fivesim";
import { logger } from "./logger";
import { getNumberExpiryOutcome } from "./number-expiry-policy";
import { broadcastNotification } from "../routes/notifications";

const POLL_INTERVAL_MS     = 15_000;
const ERROR_BACKOFF_MS     = 60_000;
const MAX_CONCURRENT_POLLS = 10;
/* Auto-refund: the persisted Simix expiry is authoritative, including extensions. */
const SWEEP_INTERVAL_MS    = 60 * 1_000; /* vérifie chaque minute */

let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let sweepTimer:  ReturnType<typeof setTimeout> | null = null;
let running = false;
let consecutiveDbErrors = 0;

/* ─── Start / Stop ────────────────────────────────────────────── */

export function startFiveSimPoller(): void {
  if (running) return;
  running = true;
  consecutiveDbErrors = 0;
  logger.info("[5sim-poller] Started background SMS polling (interval: 15s) + auto-refund sweep (1min)");
  schedule(POLL_INTERVAL_MS);
  /* Recover numbers left terminal by an older code path as soon as this worker starts. */
  void runAutoRefundSweep();
}

export function stopFiveSimPoller(): void {
  running = false;
  if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
  if (sweepTimer)  { clearTimeout(sweepTimer);  sweepTimer  = null; }
  logger.info("[5sim-poller] Stopped");
}

function schedule(delayMs: number): void {
  if (!running) return;
  if (pollerTimer) clearTimeout(pollerTimer);
  pollerTimer = setTimeout(() => void pollAll(), delayMs);
}

function scheduleSweep(delayMs: number): void {
  if (!running) return;
  if (sweepTimer) clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => void runAutoRefundSweep(), delayMs);
}

/* ─── Main poll loop ─────────────────────────────────────────── */

async function pollAll(): Promise<void> {
  let provider: (typeof apiProvidersTable.$inferSelect) | undefined;
  try {
    [provider] = await db
      .select()
      .from(apiProvidersTable)
      .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
      .limit(1);
    consecutiveDbErrors = 0;
  } catch (e) {
    consecutiveDbErrors++;
    const backoff = consecutiveDbErrors >= 3 ? ERROR_BACKOFF_MS : POLL_INTERVAL_MS;
    logger.error(
      { err: (e as Error).message, consecutiveDbErrors, nextRetryMs: backoff },
      "[5sim-poller] DB error — backing off",
    );
    schedule(backoff);
    return;
  }

  if (!provider?.apiKey) {
    schedule(POLL_INTERVAL_MS);
    return;
  }

  const client = new FiveSimClient(provider.apiKey);

  let pendingNumbers: (typeof virtualNumbersTable.$inferSelect)[];
  try {
    pendingNumbers = await db
      .select()
      .from(virtualNumbersTable)
      .where(
        and(
          eq(virtualNumbersTable.status, "waiting"),
          isNotNull(virtualNumbersTable.externalOrderId),
          gt(virtualNumbersTable.expiresAt, new Date()),
        ),
      );
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[5sim-poller] Failed to load pending numbers");
    schedule(POLL_INTERVAL_MS);
    return;
  }

  if (pendingNumbers.length === 0) {
    schedule(POLL_INTERVAL_MS);
    return;
  }

  logger.debug({ count: pendingNumbers.length }, "[5sim-poller] Polling active orders");

  try {
    for (let i = 0; i < pendingNumbers.length; i += MAX_CONCURRENT_POLLS) {
      const batch = pendingNumbers.slice(i, i + MAX_CONCURRENT_POLLS);
      await Promise.allSettled(batch.map(vn => pollSingleOrder(client, vn)));
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[5sim-poller] Batch error");
  }

  schedule(POLL_INTERVAL_MS);
}

/* ─── Poll a single order ────────────────────────────────────── */

async function pollSingleOrder(
  client: FiveSimClient,
  vn: typeof virtualNumbersTable.$inferSelect,
): Promise<void> {
  const orderId = Number(vn.externalOrderId);
  if (!orderId || isNaN(orderId)) return;

  const isHosting = vn.numberType === "hosting";

  if (isHosting) {
    await pollHostingOrder(client, vn, orderId);
  } else {
    await pollActivationOrder(client, vn, orderId);
  }
}

/* ─── Activation number poll (one-shot) ────────────────────────── */

async function pollActivationOrder(
  client: FiveSimClient,
  vn: typeof virtualNumbersTable.$inferSelect,
  orderId: number,
): Promise<void> {
  try {
    const order = await client.checkOrder(orderId);

    /* Save SMS first: terminal provider responses may still contain the final SMS. */
    const { newSmsCount, hasStoredSms } = await saveNewSmsMessages(vn.id, order.sms ?? []);
    if (hasStoredSms) {
      await db
        .update(virtualNumbersTable)
        .set({ status: "received" })
        .where(and(
          eq(virtualNumbersTable.id, vn.id),
          eq(virtualNumbersTable.status, "waiting"),
        ));

      if (order.status === "RECEIVED") {
        try {
          await client.finishOrder(orderId);
          logger.info({ orderId }, "[5sim-poller] Activation order finished on 5sim");
        } catch { /* non-critical */ }
      }

      if (newSmsCount > 0) {
        await pushSmsNotification(vn, order.sms ?? []);
      }
    }

    if (order.status === "TIMEOUT") {
      await handleExpiredOrder(vn);
      return;
    }

    if (order.status === "CANCELED" || order.status === "BANNED") {
      await handleCancelledOrder(vn);
      return;
    }
  } catch (e) {
    if (e instanceof FiveSimError) {
      if (e.isNotFound) {
        await handleExpiredOrder(vn);
      } else if (e.isUnauthorized) {
        logger.error("[5sim-poller] Unauthorised 5sim API key — stopping poller");
        stopFiveSimPoller();
      } else {
        logger.warn({ err: e.message, orderId, numberId: vn.id }, "[5sim-poller] Poll error");
      }
    } else {
      logger.warn({ err: (e as Error).message, numberId: vn.id }, "[5sim-poller] Poll error");
    }
  }
}

/* ─── Hosting number poll (long-term rental) ───────────────────── */
/**
 * Les numéros hosting utilisent l'endpoint /user/sms/inbox/{id}
 * plutôt que /user/check/{id}. Ils peuvent recevoir plusieurs SMS
 * et restent actifs jusqu'à l'expiration (gérée localement par expiresAt).
 * On ne les marque PAS comme "received" après le premier SMS — ils
 * continuent de recevoir jusqu'à leur expiration naturelle.
 */
async function pollHostingOrder(
  client: FiveSimClient,
  vn: typeof virtualNumbersTable.$inferSelect,
  orderId: number,
): Promise<void> {
  try {
    const inbox = await client.getSmsInbox(orderId);

    if (!inbox?.Data || inbox.Data.length === 0) {
      return; // Pas encore de SMS, continuer à attendre
    }

    const { newSmsCount } = await saveNewSmsMessages(vn.id, inbox.Data);

    if (newSmsCount > 0) {
      logger.info({ orderId, numberId: vn.id, newSmsCount }, "[5sim-poller] New SMS in hosting inbox");
      await pushSmsNotification(vn, inbox.Data.slice(-newSmsCount));
      /* Note: on ne change pas le status en "received" pour les hosting,
         ils restent en "waiting" jusqu'à expiration ou arrêt côté fournisseur. */
    }
  } catch (e) {
    if (e instanceof FiveSimError) {
      if (e.isNotFound) {
        /* Order gone on 5sim — marquer expiré localement */
        await handleExpiredOrder(vn);
      } else if (e.isUnauthorized) {
        logger.error("[5sim-poller] Unauthorised 5sim API key — stopping poller");
        stopFiveSimPoller();
      } else {
        logger.warn({ err: e.message, orderId, numberId: vn.id }, "[5sim-poller] Hosting poll error");
      }
    } else {
      logger.warn({ err: (e as Error).message, numberId: vn.id }, "[5sim-poller] Hosting poll error");
    }
  }
}

/* ─── SMS helpers ─────────────────────────────────────────────── */

async function saveNewSmsMessages(
  numberId: string,
  smsList: Array<{ text: string; sender: string; code: string; id?: number; created_at?: string; date?: string }>,
): Promise<{ newSmsCount: number; hasStoredSms: boolean }> {
  return db.transaction(async (tx) => {
    /* Serialize SMS persistence against expiry/refund for this same number. */
    const [number] = await tx
      .select({ status: virtualNumbersTable.status })
      .from(virtualNumbersTable)
      .where(eq(virtualNumbersTable.id, numberId))
      .for("update")
      .limit(1);
    if (!number || number.status !== "waiting") {
      return { newSmsCount: 0, hasStoredSms: false };
    }

    const existingMsgs = await tx
      .select({ body: smsMessagesTable.body })
      .from(smsMessagesTable)
      .where(eq(smsMessagesTable.numberId, numberId));
    const existingBodies = new Set(existingMsgs.map((message) => message.body));
    let newSmsCount = 0;

    for (const sms of smsList) {
      if (existingBodies.has(sms.text)) continue;
      await tx.insert(smsMessagesTable).values({
        numberId,
        sender: sms.sender || "Unknown",
        body: sms.text,
        code: sms.code || extractCode(sms.text) || "",
      });
      existingBodies.add(sms.text);
      newSmsCount++;
      logger.info({ numberId, sender: sms.sender }, "[5sim-poller] New SMS saved");
    }

    return { newSmsCount, hasStoredSms: existingBodies.size > 0 };
  });
}

async function pushSmsNotification(
  vn: typeof virtualNumbersTable.$inferSelect,
  smsList: Array<{ text: string; sender: string; code: string }>,
): Promise<void> {
  try {
    const latestSms = smsList[smsList.length - 1];
    const code = latestSms ? (latestSms.code || extractCode(latestSms.text) || "") : "";
    const notifBody = code
      ? `Code reçu : ${code} — Vérifiez votre numéro virtuel.`
      : "Un SMS est arrivé sur votre numéro virtuel.";

    const [notif] = await db.insert(notificationsTable).values({
      userId: vn.userId,
      title: "📩 SMS reçu",
      body: notifBody,
      type: "sms",
      icon: "message",
      link: `/numbers/${vn.id}`,
      metadata: { numberId: vn.id, code, sender: latestSms?.sender },
    }).returning();
    if (notif) broadcastNotification(notif);
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[5sim-poller] Failed to send SMS notification");
  }
}

/* ─── Expiry / Cancellation handlers ─────────────────────────── */

async function handleExpiredOrder(vn: typeof virtualNumbersTable.$inferSelect): Promise<void> {
  let smsReceived = 0;
  let refundIssued = false;
  let stillActive = false;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: virtualNumbersTable.status,
          expiresAt: virtualNumbersTable.expiresAt,
          userId: virtualNumbersTable.userId,
          price: virtualNumbersTable.price,
          createdAt: virtualNumbersTable.createdAt,
        })
        .from(virtualNumbersTable)
        .where(eq(virtualNumbersTable.id, vn.id))
        .for("update")
        .limit(1);

      if (!current || current.status !== "waiting") return;

      const [msgCount] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.numberId, vn.id));
      smsReceived = msgCount?.c ?? 0;

      const outcome = getNumberExpiryOutcome(current.expiresAt, new Date(), smsReceived);
      if (outcome === "still_active") {
        /* A provider TIMEOUT must not override a Simix extension. */
        stillActive = true;
        return;
      }

      await tx
        .update(virtualNumbersTable)
        .set({ status: smsReceived > 0 ? "received" : "expired" })
        .where(and(eq(virtualNumbersTable.id, vn.id), eq(virtualNumbersTable.status, "waiting")));

      if (outcome === "expired_without_sms") {
        const [existingRefund] = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "refund"),
            eq(transactionsTable.virtualNumberId, vn.id),
          ))
          .limit(1);
        if (existingRefund) return;

        const legacyRefundWindowEnd = new Date(current.createdAt.getTime() + 2 * 60 * 60 * 1_000);
        const [legacyRefund] = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "refund"),
            eq(transactionsTable.userId, current.userId),
            eq(transactionsTable.amount, current.price),
            isNull(transactionsTable.virtualNumberId),
            gt(transactionsTable.createdAt, current.createdAt),
            lt(transactionsTable.createdAt, legacyRefundWindowEnd),
          ))
          .limit(1);
        if (legacyRefund) return;

        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${current.price}` })
          .where(eq(usersTable.id, current.userId));

        await tx.insert(transactionsTable).values({
          userId: current.userId,
          type: "refund",
          amount: current.price,
          status: "completed",
          method: "wallet",
          virtualNumberId: vn.id,
          description: "Remboursement automatique (numéro expiré sans SMS reçu)",
        });

        refundIssued = true;
      }
    });
  } catch (txErr) {
    /* Transaction rolled back — status stays "waiting", sweep will retry */
    logger.error({ err: (txErr as Error).message, numberId: vn.id }, "[5sim-poller] handleExpiredOrder transaction failed — will retry on next sweep");
    return;
  }

  if (stillActive) {
    logger.info(
      { numberId: vn.id, providerOrderId: vn.externalOrderId, expiresAt: vn.expiresAt },
      "[5sim-poller] Provider order ended before the Simix expiry; keep waiting until local expiry",
    );
    return;
  }

  logger.info({ numberId: vn.id, orderId: vn.externalOrderId, smsReceived, refundIssued }, "[5sim-poller] Order expired");

  if (refundIssued) {
    logger.info({ numberId: vn.id, userId: vn.userId, amount: vn.price }, "[5sim-poller] Auto-refund on expiry");
    try {
      const [notif] = await db.insert(notificationsTable).values({
        userId: vn.userId,
        title: "💸 Remboursement effectué",
        body: `${vn.price} FCFA remboursés — numéro expiré sans réception de SMS.`,
        type: "refund",
        icon: "wallet",
        link: `/wallet`,
        metadata: { amount: vn.price, numberId: vn.id, reason: "expired" },
      }).returning();
      if (notif) broadcastNotification(notif);
    } catch { /* non-critical */ }
  } else if (smsReceived > 0) {
    try {
      const [notif] = await db.insert(notificationsTable).values({
        userId: vn.userId,
        title: "⏰ Numéro expiré",
        body: "Votre numéro virtuel a expiré. Vous avez reçu un SMS — aucun remboursement n'est dû.",
        type: "expired",
        icon: "clock",
        link: `/numbers/${vn.id}`,
        metadata: { numberId: vn.id },
      }).returning();
      if (notif) broadcastNotification(notif);
    } catch { /* non-critical */ }
  }
}

async function handleCancelledOrder(vn: typeof virtualNumbersTable.$inferSelect): Promise<void> {
  let smsReceived = 0;
  let refundIssued = false;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          status: virtualNumbersTable.status,
          userId: virtualNumbersTable.userId,
          price: virtualNumbersTable.price,
          createdAt: virtualNumbersTable.createdAt,
        })
        .from(virtualNumbersTable)
        .where(eq(virtualNumbersTable.id, vn.id))
        .for("update")
        .limit(1);

      if (!current || current.status !== "waiting") return;

      const [msgCount] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.numberId, vn.id));
      smsReceived = msgCount?.c ?? 0;

      await tx
        .update(virtualNumbersTable)
        .set({ status: smsReceived > 0 ? "received" : "cancelled", expiresAt: new Date() })
        .where(and(eq(virtualNumbersTable.id, vn.id), eq(virtualNumbersTable.status, "waiting")));

      if (smsReceived === 0) {
        const [existingRefund] = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "refund"),
            eq(transactionsTable.virtualNumberId, vn.id),
          ))
          .limit(1);
        if (existingRefund) return;

        const legacyRefundWindowEnd = new Date(current.createdAt.getTime() + 2 * 60 * 60 * 1_000);
        const [legacyRefund] = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "refund"),
            eq(transactionsTable.userId, current.userId),
            eq(transactionsTable.amount, current.price),
            isNull(transactionsTable.virtualNumberId),
            gt(transactionsTable.createdAt, current.createdAt),
            lt(transactionsTable.createdAt, legacyRefundWindowEnd),
          ))
          .limit(1);
        if (legacyRefund) return;

        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${current.price}` })
          .where(eq(usersTable.id, current.userId));

        await tx.insert(transactionsTable).values({
          userId: current.userId,
          type: "refund",
          amount: current.price,
          status: "completed",
          method: "wallet",
          virtualNumberId: vn.id,
          description: "Remboursement automatique (5sim annulé)",
        });

        refundIssued = true;
      }
    });
  } catch (txErr) {
    logger.error({ err: (txErr as Error).message, numberId: vn.id }, "[5sim-poller] handleCancelledOrder transaction failed — will retry on next sweep");
    return;
  }

  if (refundIssued) {
    logger.info({ numberId: vn.id, userId: vn.userId, amount: vn.price }, "[5sim-poller] Auto-refund issued");
    try {
      const [notif] = await db.insert(notificationsTable).values({
        userId: vn.userId,
        title: "💸 Remboursement effectué",
        body: `${vn.price} FCFA ont été remboursés sur votre solde (commande annulée).`,
        type: "refund",
        icon: "wallet",
        link: `/wallet`,
        metadata: { amount: vn.price, numberId: vn.id },
      }).returning();
      if (notif) broadcastNotification(notif);
    } catch { /* non-critical */ }
  }
}

/* ─── Auto-refund sweep (persisted local expiry) ────────────────── */

/**
 * Vérifie chaque minute les numéros dont l'échéance locale est passée ;
 *   - sont déjà "expired"/"cancelled" mais n'ont pas de remboursement associé
 *     (récupération de dossiers laissés incomplets par une ancienne version).
 * Dans les deux cas, aucun SMS ne doit avoir été enregistré.
 *
 * Exporte également `triggerAutoRefundSweep` pour l'endpoint admin.
 */
export async function triggerAutoRefundSweep(): Promise<{ processed: number; refunded: number; errors: number }> {
  const now    = new Date();

  const stuckNumbers = await db
    .select()
    .from(virtualNumbersTable)
    .where(
      or(
        and(
          eq(virtualNumbersTable.status, "waiting"),
          lte(virtualNumbersTable.expiresAt, now),
        ),
        and(
          or(
            eq(virtualNumbersTable.status, "expired"),
            eq(virtualNumbersTable.status, "cancelled"),
          ),
          lte(virtualNumbersTable.expiresAt, now),
          /* Recover only terminal rows that still have no recorded refund. */
          sql`NOT EXISTS (
            SELECT 1 FROM transactions t
            WHERE t.type = 'refund'
              AND (
                t.virtual_number_id = ${virtualNumbersTable.id}
                OR (
                  t.virtual_number_id IS NULL
                  AND t.user_id = ${virtualNumbersTable.userId}
                  AND t.amount = ${virtualNumbersTable.price}
                  AND t.created_at > ${virtualNumbersTable.createdAt}
                  AND t.created_at < ${virtualNumbersTable.createdAt} + interval '2 hours'
                )
              )
          )`,
        ),
      ),
    );

  logger.info({ count: stuckNumbers.length }, "[5sim-poller] Auto-refund sweep: found stuck numbers");

  let processed = 0, refunded = 0, errors = 0;

  for (const vn of stuckNumbers) {
    try {
      let refundCommitted = false;
      let shouldCancelProviderOrder = false;
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            status: virtualNumbersTable.status,
            userId: virtualNumbersTable.userId,
            price: virtualNumbersTable.price,
            createdAt: virtualNumbersTable.createdAt,
            expiresAt: virtualNumbersTable.expiresAt,
          })
          .from(virtualNumbersTable)
          .where(eq(virtualNumbersTable.id, vn.id))
          .for("update")
          .limit(1);

        if (!current || !["waiting", "expired", "cancelled"].includes(current.status)) return;
        if (getNumberExpiryOutcome(current.expiresAt, new Date(), 0) === "still_active") return;

        const [currentSmsCount] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(smsMessagesTable)
          .where(eq(smsMessagesTable.numberId, vn.id));
        if ((currentSmsCount?.c ?? 0) > 0) {
          await tx
            .update(virtualNumbersTable)
            .set({ status: "received" })
            .where(and(
              eq(virtualNumbersTable.id, vn.id),
              or(
                eq(virtualNumbersTable.status, "waiting"),
                eq(virtualNumbersTable.status, "expired"),
                eq(virtualNumbersTable.status, "cancelled"),
              ),
              lte(virtualNumbersTable.expiresAt, new Date()),
            ));
          return;
        }

        if (current.status === "waiting") {
          const updated = await tx
            .update(virtualNumbersTable)
            .set({ status: "expired" })
            .where(and(
              eq(virtualNumbersTable.id, vn.id),
              eq(virtualNumbersTable.status, "waiting"),
              lte(virtualNumbersTable.expiresAt, new Date()),
            ))
            .returning({ id: virtualNumbersTable.id });
          if (updated.length === 0) return;
          shouldCancelProviderOrder = true;
        }

        const [existingRefund] = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "refund"),
            eq(transactionsTable.virtualNumberId, vn.id),
          ))
          .limit(1);
        if (existingRefund) return;

        /* Older refunds may predate virtual_number_id. Conservatively match the
           same legacy heuristic used by the admin missing-refunds screen. */
        const legacyRefundWindowEnd = new Date(current.createdAt.getTime() + 2 * 60 * 60 * 1_000);
        const [legacyRefund] = await tx
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "refund"),
            eq(transactionsTable.userId, current.userId),
            eq(transactionsTable.amount, current.price),
            isNull(transactionsTable.virtualNumberId),
            gt(transactionsTable.createdAt, current.createdAt),
            lt(transactionsTable.createdAt, legacyRefundWindowEnd),
          ))
          .limit(1);
        if (legacyRefund) return;

        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${current.price}` })
          .where(eq(usersTable.id, current.userId));

        await tx.insert(transactionsTable).values({
          userId: current.userId,
          type: "refund",
          amount: current.price,
          status: "completed",
          method: "wallet",
          virtualNumberId: vn.id,
          description: "Remboursement automatique (expiration sans SMS reçu)",
        });

        refundCommitted = true;
      });

      if (!refundCommitted) {
        processed++;
        continue;
      }

      /* Close a still-open provider order after the refund has been committed. */
      if (shouldCancelProviderOrder && vn.externalOrderId) {
        const client = await getFiveSimClient();
        if (client) {
          try {
            await client.cancelOrder(Number(vn.externalOrderId));
            logger.info({ orderId: vn.externalOrderId, numberId: vn.id }, "[5sim-poller] Order closed on 5sim after expiry refund");
          } catch (e) {
            logger.warn({ err: (e as Error).message, orderId: vn.externalOrderId }, "[5sim-poller] Could not close expired 5sim order");
          }
        }
      }

      logger.info(
        { numberId: vn.id, userId: vn.userId, amount: vn.price, recoveredTerminalStatus: vn.status !== "waiting" },
        "[5sim-poller] Auto-refund sweep credited wallet",
      );

      try {
        const [notif] = await db.insert(notificationsTable).values({
          userId: vn.userId,
          title: "💸 Remboursement automatique",
          body: `${vn.price} FCFA remboursés — numéro arrivé à expiration sans SMS reçu.`,
          type: "refund",
          icon: "wallet",
          link: `/wallet`,
          metadata: { amount: vn.price, numberId: vn.id, reason: "expired_without_sms" },
        }).returning();
        if (notif) broadcastNotification(notif);
      } catch { /* non-critical */ }

      processed++;
      refunded++;
    } catch (e) {
      logger.error({ err: (e as Error).message, numberId: vn.id }, "[5sim-poller] Error in auto-refund sweep");
      errors++;
    }
  }

  logger.info({ processed, refunded, errors }, "[5sim-poller] Auto-refund sweep complete");
  return { processed, refunded, errors };
}

async function runAutoRefundSweep(): Promise<void> {
  try {
    await triggerAutoRefundSweep();
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[5sim-poller] Auto-refund sweep failed");
  } finally {
    scheduleSweep(SWEEP_INTERVAL_MS);
  }
}

/* ─── 5sim client factory (pour le sweep) ────────────────────── */

async function getFiveSimClient(): Promise<FiveSimClient | null> {
  try {
    const [provider] = await db
      .select()
      .from(apiProvidersTable)
      .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
      .limit(1);
    if (!provider?.apiKey) return null;
    return new FiveSimClient(provider.apiKey);
  } catch {
    return null;
  }
}

/* ─── Utils ───────────────────────────────────────────────────── */

function extractCode(text: string): string | null {
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1]! : null;
}
