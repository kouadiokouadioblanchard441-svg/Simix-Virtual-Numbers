import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getSetting } from "./settings";

let _configured = false;

async function configurePush(): Promise<boolean> {
  if (_configured) return true;

  const publicKey  = process.env.VAPID_PUBLIC_KEY  ?? await getSetting("vapid_public_key",  "");
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? await getSetting("vapid_private_key", "");
  const subject    = process.env.VAPID_SUBJECT      ?? await getSetting("vapid_subject",     "");

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    subject || "mailto:support@simix.site",
    publicKey,
    privateKey,
  );
  _configured = true;
  return true;
}

/** Force re-read VAPID keys (e.g. after updating them in admin settings) */
export function resetPushConfig(): void {
  _configured = false;
}

export async function getVapidPublicKey(): Promise<string | null> {
  const k = process.env.VAPID_PUBLIC_KEY ?? await getSetting("vapid_public_key", "");
  return k || null;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

/** Send a push notification to all subscriptions for a specific user */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const ok = await configurePush();
  if (!ok) return;

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  if (subs.length === 0) return;

  await _dispatchPush(subs, payload, userId);
}

/** Send a push notification to ALL subscribed users (for global broadcasts) */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const ok = await configurePush();
  if (!ok) return;

  const subs = await db.select().from(pushSubscriptionsTable);
  if (subs.length === 0) return;

  logger.info({ count: subs.length }, "[push] Broadcasting to all subscribers");
  await _dispatchPush(subs, payload, undefined);
}

/** Internal: send push to a list of subscriptions, cleaning up stale ones */
async function _dispatchPush(
  subs: Array<{ endpoint: string; p256dh: string; auth: string; userId: string }>,
  payload: PushPayload,
  userId: string | undefined,
): Promise<void> {
  const json = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    icon:  payload.icon ?? "/icons/icon-192x192.png",
    url:   payload.url  ?? "/dashboard",
  });

  const stale: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
          { TTL: 60 * 60 * 24 },
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          stale.push(sub.endpoint);
        } else {
          logger.warn({ err, userId: userId ?? "all", endpoint: sub.endpoint }, "[push] Send failed");
        }
      }
    }),
  );

  if (stale.length > 0) {
    await Promise.allSettled(
      stale.map((endpoint) =>
        db.delete(pushSubscriptionsTable)
          .where(eq(pushSubscriptionsTable.endpoint, endpoint)),
      ),
    );
    logger.info({ count: stale.length }, "[push] Stale subscriptions removed");
  }
}
