/**
 * Admin Notification Routes
 * POST   /admin/notifications          — create & send
 * GET    /admin/notifications          — list all
 * DELETE /admin/notifications/:id
 * GET    /admin/notifications/stats
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, and, isNull } from "drizzle-orm";
import { db, notificationsTable, usersTable, pushSubscriptionsTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { broadcastNotification } from "./notifications";
import { sendPushToUser, sendPushToAll } from "../lib/push";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: () => void): void {
  /* requireAdminJwt already verified the JWT — if adminPayload is set, access is granted */
  if (req.adminPayload) { next(); return; }
  /* Fallback: legacy session-based check */
  if (!req.user) { res.status(401).json({ error: "Auth required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

/* ── POST /admin/notifications ───────────────────────────── */
router.post("/admin/notifications", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const {
    title,
    body,
    type = "info",
    icon,
    link,
    recipientsType = "all",
    userIds,
    metadata,
  } = req.body as {
    title: string;
    body: string;
    type?: string;
    icon?: string;
    link?: string;
    recipientsType?: "all" | "specific";
    userIds?: string[];
    metadata?: Record<string, unknown>;
  };

  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Titre et contenu requis" });
    return;
  }

  const created: typeof notificationsTable.$inferSelect[] = [];

  if (recipientsType === "all") {
    const [notif] = await db.insert(notificationsTable).values({
      title: title.trim(),
      body: body.trim(),
      type,
      icon: icon || null,
      link: link || null,
      isGlobal: true,
      metadata: metadata ?? null,
    }).returning();
    created.push(notif);
    broadcastNotification(notif);
  } else if (recipientsType === "specific" && userIds?.length) {
    for (const userId of userIds) {
      const [notif] = await db.insert(notificationsTable).values({
        userId,
        title: title.trim(),
        body: body.trim(),
        type,
        icon: icon || null,
        link: link || null,
        isGlobal: false,
        metadata: metadata ?? null,
      }).returning();
      created.push(notif);
      broadcastNotification(notif);
    }
  }

  logger.info({ count: created.length }, "[admin-notifications] Notifications sent");
  res.status(201).json({ created: created.length, notifications: created });
});

/* ── GET /admin/notifications ────────────────────────────── */
router.get("/admin/notifications", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const notifications = await db
    .select()
    .from(notificationsTable)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(notificationsTable);

  res.json({ notifications, total: Number(total) });
});

/* ── GET /admin/notifications/stats ─────────────────────── */
router.get("/admin/notifications/stats", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [total] = await db.select({ count: count() }).from(notificationsTable);
  const [global] = await db.select({ count: count() }).from(notificationsTable)
    .where(and(eq(notificationsTable.isGlobal, true), isNull(notificationsTable.userId)));
  const [targeted] = await db.select({ count: count() }).from(notificationsTable)
    .where(eq(notificationsTable.isGlobal, false));

  res.json({
    total: Number(total.count),
    global: Number(global.count),
    targeted: Number(targeted.count),
  });
});

/* ── DELETE /admin/notifications/:id ────────────────────── */
router.delete("/admin/notifications/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.json({ success: true });
});

/* ── POST /admin/push/test ───────────────────────────────
 * Envoie une notification push de test.
 * Body: { userId?: string }  — si userId absent → broadcast à tous  */
router.post("/admin/push/test", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body as { userId?: string };

  const subCount = await db.select().from(pushSubscriptionsTable);

  if (subCount.length === 0) {
    res.status(200).json({
      success: false,
      message: "Aucun abonnement push enregistré en base de données. Activez d'abord les notifications dans l'application.",
      subscriptions: 0,
    });
    return;
  }

  const payload = {
    title: "🔔 Test Simix",
    body: "Les notifications push fonctionnent correctement !",
    url: "/dashboard",
  };

  if (userId) {
    const userSubs = subCount.filter(s => s.userId === userId);
    if (userSubs.length === 0) {
      res.status(200).json({
        success: false,
        message: `Aucun abonnement push pour l'utilisateur ${userId}.`,
        subscriptions: 0,
      });
      return;
    }
    await sendPushToUser(userId, payload);
    logger.info({ userId }, "[admin-push] Test push sent to user");
    res.json({ success: true, message: `Notification test envoyée à l'utilisateur ${userId}.`, subscriptions: userSubs.length });
  } else {
    await sendPushToAll(payload);
    logger.info({ count: subCount.length }, "[admin-push] Test push broadcast to all");
    res.json({ success: true, message: `Notification test broadcastée à ${subCount.length} abonnement(s).`, subscriptions: subCount.length });
  }
});

/* ── GET /admin/push/subscriptions ──────────────────────
 * Retourne le nombre d'abonnements push actifs             */
router.get("/admin/push/subscriptions", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const subs = await db.select().from(pushSubscriptionsTable);
  const byUser: Record<string, number> = {};
  for (const sub of subs) {
    byUser[sub.userId] = (byUser[sub.userId] ?? 0) + 1;
  }
  res.json({
    total: subs.length,
    uniqueUsers: Object.keys(byUser).length,
    byUser,
  });
});

export default router;
