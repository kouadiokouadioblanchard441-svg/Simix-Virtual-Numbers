/**
 * Admin Notification Routes
 * POST   /admin/notifications          — create & send
 * GET    /admin/notifications          — list all
 * DELETE /admin/notifications/:id
 * GET    /admin/notifications/stats
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, count, and, isNull } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { broadcastNotification } from "./notifications";
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
router.post("/admin/notifications", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
router.get("/admin/notifications", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
router.get("/admin/notifications/stats", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
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
router.delete("/admin/notifications/:id", requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.json({ success: true });
});

export default router;
