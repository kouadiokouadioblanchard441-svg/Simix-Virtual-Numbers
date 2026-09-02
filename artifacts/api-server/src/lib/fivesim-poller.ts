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

import { and, eq, gt, isNotNull, lt, lte, or, sql } from "drizzle-orm";
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
import { broadcastNotification } from "../routes/notifications";

const POLL_INTERVAL_MS     = 15_000;
const ERROR_BACKOFF_MS     = 60_000;
const MAX_CONCURRENT_POLLS = 10;
/* Auto-refund: échéance réelle + garde-fou 30 min pour les activations */
const REFUND_TIMEOUT_MS    = 30 * 60 * 1_000;
const SWEEP_INTERVAL_MS    = 5 * 60 * 1_000; /* vérifie toutes les 5 minutes */

let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let sweepTimer:  ReturnType<typeof setTimeout> | null = null;
let running = false;
let consecutiveDbErrors = 0;

/* ─── Start / Stop ────────────────────────────────────────────── */

export function startFiveSimPoller(): void {
  if (running) return;
  running = true;
  consecutiveDbErrors = 0;
  logger.info("[5sim-poller] Started background SMS polling (interval: 15s) + auto-refund sweep (5min)");
  schedule(POLL_INTERVAL_MS);
  scheduleSweep(SWEEP_INTERVAL_MS);
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

    if (order.status === "TIMEOUT") {
      await handleExpiredOrder(vn);
      return;
    }

    if (order.status === "CANCELED" || order.status === "BANNED") {
      await handleCancelledOrder(vn);
      return;
    }

    /* Save new SMS messages */
    if (order.sms && order.sms.length > 0) {
      const newSmsCount = await saveNewSmsMessages(vn.id, order.sms);

      if (newSmsCount > 0 || order.status === "RECEIVED" || order.status === "FINISHED") {
        await db
          .update(virtualNumbersTable)
          .set({ status: "received" })
          .where(eq(virtualNumbersTable.id, vn.id));

        if (order.status === "RECEIVED") {
          try {
            await client.finishOrder(orderId);
            logger.info({ orderId }, "[5sim-poller] Activation order finished on 5sim");
          } catch { /* non-critical */ }
        }

        if (newSmsCount > 0) {
          await pushSmsNotification(vn, order.sms);
        }
      }
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

    const newSmsCount = await saveNewSmsMessages(vn.id, inbox.Data);

    if (newSmsCount > 0) {
      logger.info({ orderId, numberId: vn.id, newSmsCount }, "[5sim-poller] New SMS in hosting inbox");
      await pushSmsNotification(vn, inbox.Data.slice(-newSmsCount));
      /* Note: on ne change pas le status en "received" pour les hosting,
         ils restent en "waiting" jusqu'à expiration ou annulation manuelle */
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
): Promise<number> {
  const existingMsgs = await db
    .select({ body: smsMessagesTable.body })
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, numberId));

  const existingBodies = new Set(existingMsgs.map(m => m.body));
  let newSmsCount = 0;

  for (const sms of smsList) {
    if (!existingBodies.has(sms.text)) {
      await db.insert(smsMessagesTable).values({
        numberId,
        sender: sms.sender || "Unknown",
        body: sms.text,
        code: sms.code || extractCode(sms.text) || "",
      });
      newSmsCount++;
      logger.info({ numberId, sender: sms.sender }, "[5sim-poller] New SMS saved");
    }
  }

  return newSmsCount;
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
  /* Count SMS before entering the transaction (read-only, no lock needed) */
  const [msgCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, vn.id));

  const smsReceived = msgCount?.c ?? 0;

  /* Atomic transaction: status update + refund are committed together or not at all.
   * Previously these were two separate statements — if the refund INSERT failed after
   * the status UPDATE committed, the number was left in "expired" state with no refund
   * and no recovery path (sweep only processes "waiting" numbers).                     */
  let refundIssued = false;
  try {
    await db.transaction(async (tx) => {
      /* Re-check status inside the transaction to prevent double-processing */
      const [current] = await tx
        .select({ status: virtualNumbersTable.status })
        .from(virtualNumbersTable)
        .where(eq(virtualNumbersTable.id, vn.id))
        .limit(1);

      if (!current || current.status !== "waiting") return;

      /* Mark expired */
      await tx
        .update(virtualNumbersTable)
        .set({ status: "expired", expiresAt: new Date() })
        .where(and(eq(virtualNumbersTable.id, vn.id), eq(virtualNumbersTable.status, "waiting")));

      /* Refund if no SMS received — committed atomically with status update */
      if (smsReceived === 0) {
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${vn.price}` })
          .where(eq(usersTable.id, vn.userId));

        await tx.insert(transactionsTable).values({
          userId: vn.userId,
          type: "refund",
          amount: vn.price,
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
  const [msgCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, vn.id));

  const smsReceived = msgCount?.c ?? 0;

  /* Atomic transaction: same atomicity fix as handleExpiredOrder */
  let refundIssued = false;
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: virtualNumbersTable.status })
        .from(virtualNumbersTable)
        .where(eq(virtualNumbersTable.id, vn.id))
        .limit(1);

      if (!current || current.status !== "waiting") return;

      await tx
        .update(virtualNumbersTable)
        .set({ status: "cancelled", expiresAt: new Date() })
        .where(and(eq(virtualNumbersTable.id, vn.id), eq(virtualNumbersTable.status, "waiting")));

      if (smsReceived === 0) {
        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${vn.price}` })
          .where(eq(usersTable.id, vn.userId));

        await tx.insert(transactionsTable).values({
          userId: vn.userId,
          type: "refund",
          amount: vn.price,
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

/* ─── Auto-refund sweep (expiry + activation fallback) ───────── */

/**
 * Vérifie toutes les 5 min les numéros "waiting" qui :
 *   1. ont dépassé expiresAt ; ou
 *   2. sont des activations âgées de plus de 30 min (garde-fou)
 *   2. n'ont reçu aucun SMS
 * → annule l'ordre sur 5sim (best-effort) → rembourse le solde.
 *
 * Exporte également `triggerAutoRefundSweep` pour l'endpoint admin.
 */
export async function triggerAutoRefundSweep(): Promise<{ processed: number; refunded: number; errors: number }> {
  const cutoff = new Date(Date.now() - REFUND_TIMEOUT_MS);
  const now    = new Date();

  /* Activations: expiration réelle, avec garde-fou à 30 min si la date reçue
     du fournisseur est incohérente. Hosting: uniquement à leur vraie échéance
     (3 h/24 h), jamais après seulement 30 minutes. */
  const stuckNumbers = await db
    .select()
    .from(virtualNumbersTable)
    .where(
      and(
        eq(virtualNumbersTable.status, "waiting"),
        isNotNull(virtualNumbersTable.externalOrderId),
        or(
          lte(virtualNumbersTable.expiresAt, now),
          and(
            eq(virtualNumbersTable.numberType, "activation"),
            lt(virtualNumbersTable.createdAt, cutoff),
          ),
        ),
      ),
    );

  logger.info({ count: stuckNumbers.length }, "[5sim-poller] Auto-refund sweep: found stuck numbers");

  let processed = 0, refunded = 0, errors = 0;

  for (const vn of stuckNumbers) {
    try {
      /* Double-check: aucun SMS reçu */
      const [msgCount] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.numberId, vn.id));

      if ((msgCount?.c ?? 0) > 0) {
        /* SMS reçu — juste marquer expired si toujours en waiting */
        await db
          .update(virtualNumbersTable)
          .set({ status: "expired" })
          .where(and(eq(virtualNumbersTable.id, vn.id), eq(virtualNumbersTable.status, "waiting")));
        processed++;
        continue;
      }

      /* Tenter d'annuler sur 5sim (best-effort, avant la transaction DB) */
      const client = await getFiveSimClient();
      if (client && vn.externalOrderId) {
        try {
          await client.cancelOrder(Number(vn.externalOrderId));
          logger.info({ orderId: vn.externalOrderId, numberId: vn.id }, "[5sim-poller] Order cancelled on 5sim (auto-refund sweep)");
        } catch (e) {
          logger.warn({ err: (e as Error).message, orderId: vn.externalOrderId }, "[5sim-poller] Could not cancel on 5sim (will still refund)");
        }
      }

      /* Atomic transaction: status update + balance credit + transaction record.
       * Previously the status was updated first, then the refund was inserted separately.
       * If the refund INSERT failed, the number was stuck in "cancelled" with no refund
       * and no recovery path. Now all three operations roll back together on any error. */
      let refundCommitted = false;
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(virtualNumbersTable)
          .set({ status: "cancelled", expiresAt: now })
          .where(and(eq(virtualNumbersTable.id, vn.id), eq(virtualNumbersTable.status, "waiting")))
          .returning({ id: virtualNumbersTable.id });

        if (updated.length === 0) {
          /* Un autre processus a déjà traité ce numéro — sortir sans erreur */
          return;
        }

        await tx
          .update(usersTable)
          .set({ balance: sql`${usersTable.balance} + ${vn.price}` })
          .where(eq(usersTable.id, vn.userId));

        await tx.insert(transactionsTable).values({
          userId: vn.userId,
          type: "refund",
          amount: vn.price,
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

      logger.info({ numberId: vn.id, userId: vn.userId, amount: vn.price }, "[5sim-poller] Auto-refund (30-min sweep)");

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
