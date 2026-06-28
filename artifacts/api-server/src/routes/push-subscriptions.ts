import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { getVapidPublicKey } from "../lib/push";

const router: IRouter = Router();

/* ── GET /push/vapid-public-key ────────────────────────────────────────────
 * Returns the VAPID public key so the frontend can subscribe.             */
router.get("/push/vapid-public-key", async (_req: Request, res: Response): Promise<void> => {
  const key = await getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push notifications not configured." });
    return;
  }
  res.json({ publicKey: key });
});

/* ── POST /push/subscribe ──────────────────────────────────────────────────
 * Saves a push subscription for the authenticated user.
 * Body: { endpoint, keys: { p256dh, auth } }                              */
router.post("/push/subscribe", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Subscription invalide." });
    return;
  }

  const userAgent = req.headers["user-agent"] ?? null;

  await db
    .insert(pushSubscriptionsTable)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });

  logger.info({ userId: user.id }, "[push] Subscription saved");
  res.json({ success: true });
});

/* ── DELETE /push/unsubscribe ──────────────────────────────────────────────
 * Removes a push subscription.
 * Body: { endpoint }                                                       */
router.delete("/push/unsubscribe", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: "Endpoint manquant." });
    return;
  }

  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.endpoint, endpoint),
        eq(pushSubscriptionsTable.userId, user.id),
      ),
    );

  logger.info({ userId: user.id }, "[push] Subscription removed");
  res.json({ success: true });
});

export default router;
