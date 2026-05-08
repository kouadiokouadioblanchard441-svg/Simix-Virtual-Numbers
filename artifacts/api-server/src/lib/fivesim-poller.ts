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
} from "@workspace/db";
import { FiveSimClient, FiveSimError } from "./fivesim";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 15_000;   // every 15 seconds
const MAX_CONCURRENT_POLLS = 10;   // max parallel API calls per tick

let pollerTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/* ─── Start / Stop ────────────────────────────────────────────── */

export function startFiveSimPoller(): void {
  if (running) return;
  running = true;
  logger.info("[5sim-poller] Started background SMS polling (interval: 15s)");
  scheduleNext();
}

export function stopFiveSimPoller(): void {
  running = false;
  if (pollerTimer) { clearTimeout(pollerTimer); pollerTimer = null; }
  logger.info("[5sim-poller] Stopped");
}

function scheduleNext(): void {
  if (!running) return;
  pollerTimer = setTimeout(() => void pollAll(), POLL_INTERVAL_MS);
}

/* ─── Main poll loop ─────────────────────────────────────────── */

async function pollAll(): Promise<void> {
  try {
    /* 1. Get active 5sim client */
    const [provider] = await db
      .select()
      .from(apiProvidersTable)
      .where(and(eq(apiProvidersTable.slug, "5sim"), eq(apiProvidersTable.active, true)))
      .limit(1);

    if (!provider?.apiKey) {
      scheduleNext();
      return;
    }

    const client = new FiveSimClient(provider.apiKey);

    /* 2. Find all numbers waiting for SMS with a real 5sim order ID */
    const pendingNumbers = await db
      .select()
      .from(virtualNumbersTable)
      .where(
        and(
          eq(virtualNumbersTable.status, "waiting"),
          isNotNull(virtualNumbersTable.externalOrderId),
          gt(virtualNumbersTable.expiresAt, new Date()),
        ),
      );

    if (pendingNumbers.length === 0) {
      scheduleNext();
      return;
    }

    logger.debug({ count: pendingNumbers.length }, "[5sim-poller] Polling active orders");

    /* 3. Process in batches */
    for (let i = 0; i < pendingNumbers.length; i += MAX_CONCURRENT_POLLS) {
      const batch = pendingNumbers.slice(i, i + MAX_CONCURRENT_POLLS);
      await Promise.allSettled(batch.map(vn => pollSingleOrder(client, vn)));
    }
  } catch (e) {
    logger.error({ err: (e as Error).message }, "[5sim-poller] Unexpected error in poll loop");
  } finally {
    scheduleNext();
  }
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

    /* ── Handle terminal states ── */
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
      /* Load existing bodies to avoid duplicates (UUID ids are auto-generated) */
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
          logger.info(
            { numberId: vn.id, orderId, sender: sms.sender },
            "[5sim-poller] New SMS saved",
          );
        }
      }

      /* ── Mark number as received and finish the order ── */
      if (
        newSmsCount > 0 ||
        order.status === "RECEIVED" ||
        order.status === "FINISHED"
      ) {
        await db
          .update(virtualNumbersTable)
          .set({ status: "received" })
          .where(eq(virtualNumbersTable.id, vn.id));

        /* Call finishOrder only if status is RECEIVED (not already FINISHED) */
        if (order.status === "RECEIVED") {
          try {
            await client.finishOrder(orderId);
            logger.info({ orderId }, "[5sim-poller] Order marked as FINISHED on 5sim");
          } catch (e) {
            /* Non-critical — may already be finished */
            logger.debug({ err: (e as Error).message, orderId }, "[5sim-poller] finishOrder skipped");
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof FiveSimError) {
      if (e.isNotFound) {
        await handleExpiredOrder(vn);
      } else if (e.isUnauthorized) {
        logger.error("[5sim-poller] Unauthorised API key — stopping poller");
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

  /* Refund if no SMS was received */
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

    logger.info(
      { numberId: vn.id, userId: vn.userId, amount: vn.price },
      "[5sim-poller] Auto-refund issued for cancelled order",
    );
  }
}

/** Extract 4-8 digit code from SMS text */
function extractCode(text: string): string | null {
  const match = text.match(/\b(\d{4,8})\b/);
  return match ? match[1]! : null;
}
