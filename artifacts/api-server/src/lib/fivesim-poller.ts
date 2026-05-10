/**
 * 5sim Background Poller
 *
 * Polls all active virtual numbers with a 5sim externalOrderId every 15 seconds.
 * - Fetches new SMS from 5sim API
 * - Saves new messages to sms_messages table
 * - Marks number as "received" and calls finishOrder when SMS arrives
 * - Handles TIMEOUT / CANCELLED orders (marks as expired/cancelled + auto-refund)
 */

import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
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

const POLL_INTERVAL_MS = 15_000;    // every 15 seconds (normal)
const ERROR_BACKOFF_MS  = 60_000;   // wait 60s after DB/network error

const MAX_CONCURRENT_POLLS = 10;

let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let consecutiveDbErrors = 0;

/* ─── Start / Stop ────────────────────────────────────────────── */

export function startFiveSimPoller(): void {
  if (running) return;
  running = true;
  consecutiveDbErrors = 0;
  logger.info("[5sim-poller] Started background SMS polling (interval: 15s)");
  schedule(POLL_INTERVAL_MS);
}

export function stopFiveSimPoller(): void {
  running = false;
  if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
  logger.info("[5sim-poller] Stopped");
}

/** Schedule exactly one next tick, cancelling any pending timer first. */
function schedule(delayMs: number): void {
  if (!running) return;
  if (pollerTimer) clearTimeout(pollerTimer);
  pollerTimer = setTimeout(() => void pollAll(), delayMs);
}

/* ─── Main poll loop (no finally — explicit scheduling in every path) ── */

async function pollAll(): Promise<void> {
  /* 1. Get active 5sim provider */
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

  /* 2. Find all numbers waiting for SMS */
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

  /* 3. Process in batches */
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

    /* ── Save new SMS messages ── */
    if (order.sms && order.sms.length > 0) {
      const existingMsgs = await db
        .select({ body: smsMessagesTable.body })
        .from(smsMessagesTable)
        .where(eq(smsMessagesTable.numberId, vn.id));

      const existingBodies = new Set(existingMsgs.map(m => m.body));
      let newSmsCount = 0;

      for (const sms of order.sms) {
        if (!existingBodies.has(sms.text)) {
          await db.insert(smsMessagesTable).values({
            numberId: vn.id,
            sender: sms.sender || "Unknown",
            body: sms.text,
            code: sms.code || extractCode(sms.text) || "",
          });
          newSmsCount++;
          logger.info({ numberId: vn.id, orderId, sender: sms.sender }, "[5sim-poller] New SMS saved");
        }
      }

      if (newSmsCount > 0 || order.status === "RECEIVED" || order.status === "FINISHED") {
        await db
          .update(virtualNumbersTable)
          .set({ status: "received" })
          .where(eq(virtualNumbersTable.id, vn.id));

        if (order.status === "RECEIVED") {
          try {
            await client.finishOrder(orderId);
            logger.info({ orderId }, "[5sim-poller] Order marked as FINISHED on 5sim");
          } catch {
            /* Non-critical — may already be finished */
          }
        }

        /* ── Push real-time SMS notification ── */
        if (newSmsCount > 0) {
          try {
            const latestSms = order.sms?.[order.sms.length - 1];
            const code = latestSms ? (latestSms.code || extractCode(latestSms.text) || "") : "";
            const notifTitle = "📩 SMS reçu";
            const notifBody = code
              ? `Code reçu : ${code} — Vérifiez votre numéro virtuel.`
              : "Un SMS est arrivé sur votre numéro virtuel.";
            const [notif] = await db.insert(notificationsTable).values({
              userId: vn.userId,
              title: notifTitle,
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

/* ─── Helpers ─────────────────────────────────────────────────── */

async function handleExpiredOrder(vn: typeof virtualNumbersTable.$inferSelect): Promise<void> {
  const [current] = await db
    .select({ status: virtualNumbersTable.status })
    .from(virtualNumbersTable)
    .where(eq(virtualNumbersTable.id, vn.id))
    .limit(1);

  if (!current || current.status !== "waiting") return;

  await db
    .update(virtualNumbersTable)
    .set({ status: "expired", expiresAt: new Date() })
    .where(eq(virtualNumbersTable.id, vn.id));

  logger.info({ numberId: vn.id, orderId: vn.externalOrderId }, "[5sim-poller] Order expired");

  /* ── Push expired notification ── */
  try {
    const [notif] = await db.insert(notificationsTable).values({
      userId: vn.userId,
      title: "⏰ Numéro expiré",
      body: "Votre numéro virtuel a expiré sans recevoir de SMS. Si aucun SMS n'a été reçu, un remboursement sera effectué automatiquement.",
      type: "expired",
      icon: "clock",
      link: `/numbers`,
      metadata: { numberId: vn.id },
    }).returning();
    if (notif) broadcastNotification(notif);
  } catch { /* non-critical */ }
}

async function handleCancelledOrder(vn: typeof virtualNumbersTable.$inferSelect): Promise<void> {
  const [current] = await db
    .select({ status: virtualNumbersTable.status })
    .from(virtualNumbersTable)
    .where(eq(virtualNumbersTable.id, vn.id))
    .limit(1);

  if (!current || current.status !== "waiting") return;

  const [msgCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(smsMessagesTable)
    .where(eq(smsMessagesTable.numberId, vn.id));

  await db
    .update(virtualNumbersTable)
    .set({ status: "cancelled", expiresAt: new Date() })
    .where(eq(virtualNumbersTable.id, vn.id));

  if ((msgCount?.c ?? 0) === 0) {
    await db
      .update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${vn.price}` })
      .where(eq(usersTable.id, vn.userId));

    await db.insert(transactionsTable).values({
      userId: vn.userId,
      type: "refund",
      amount: vn.price,
      status: "completed",
      method: "wallet",
      description: "Remboursement automatique (5sim annulé)",
    });

    logger.info({ numberId: vn.id, userId: vn.userId, amount: vn.price }, "[5sim-poller] Auto-refund issued");

    /* ── Push refund notification ── */
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

/** Extract 4-8 digit verification code from SMS text */
function extractCode(text: string): string | null {
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1]! : null;
}
