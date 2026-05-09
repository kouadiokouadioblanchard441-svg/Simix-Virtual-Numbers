/**
 * User-facing Notification Routes
 * GET  /notifications          — list user notifications (paginated)
 * GET  /notifications/unread-count — unread badge count
 * GET  /notifications/stream   — SSE real-time stream
 * PATCH /notifications/:id/read
 * PATCH /notifications/read-all
 * DELETE /notifications/:id
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, or, isNull, count, not, exists, inArray } from "drizzle-orm";
import { db, notificationsTable, notificationReadsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ── SSE clients registry ─────────────────────────────────── */
type SseClient = { userId: string; res: Response };
const sseClients: SseClient[] = [];

export function broadcastNotification(notification: {
  id: string;
  title: string;
  body: string;
  type: string;
  icon?: string | null;
  link?: string | null;
  createdAt: Date;
  isRead: boolean;
  isGlobal: boolean;
  userId?: string | null;
}): void {
  const data = JSON.stringify({ event: "notification", data: notification });
  const targets = sseClients.filter(c =>
    notification.isGlobal || c.userId === notification.userId
  );
  for (const client of targets) {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch { /* client disconnected */ }
  }
}

/* ── SSE Stream ───────────────────────────────────────────── */
router.get("/notifications/stream", requireAuth, (req: Request, res: Response): void => {
  const userId = req.user!.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`: connected\n\n`);

  const client: SseClient = { userId, res };
  sseClients.push(client);

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 20_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    const idx = sseClients.indexOf(client);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

/* ── Helper: build where clause for user ─────────────────── */
function userNotifWhere(userId: string) {
  return or(
    eq(notificationsTable.userId, userId),
    and(eq(notificationsTable.isGlobal, true), isNull(notificationsTable.userId))
  );
}

/* ── GET /notifications ───────────────────────────────────── */
router.get("/notifications", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const offset = Number(req.query.offset) || 0;

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(userNotifWhere(userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const readGlobalIds = await db
    .select({ notificationId: notificationReadsTable.notificationId })
    .from(notificationReadsTable)
    .where(eq(notificationReadsTable.userId, userId));

  const readSet = new Set(readGlobalIds.map(r => r.notificationId));

  const withRead = notifications.map(n => ({
    ...n,
    isRead: n.isGlobal ? readSet.has(n.id) : n.isRead,
  }));

  res.json({ notifications: withRead });
});

/* ── GET /notifications/unread-count ─────────────────────── */
router.get("/notifications/unread-count", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  const readGlobalIds = await db
    .select({ notificationId: notificationReadsTable.notificationId })
    .from(notificationReadsTable)
    .where(eq(notificationReadsTable.userId, userId));

  const readSet = readGlobalIds.map(r => r.notificationId);

  const directUnread = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  const globalUnread = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.isGlobal, true),
        isNull(notificationsTable.userId),
        readSet.length > 0 ? not(inArray(notificationsTable.id, readSet)) : undefined
      )
    );

  const total = (directUnread[0]?.count ?? 0) + (globalUnread[0]?.count ?? 0);
  res.json({ count: Number(total) });
});

/* ── PATCH /notifications/:id/read ───────────────────────── */
router.patch("/notifications/:id/read", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;

  const [notif] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id))
    .limit(1);

  if (!notif) { res.status(404).json({ error: "Not found" }); return; }

  if (notif.isGlobal) {
    await db.insert(notificationReadsTable)
      .values({ notificationId: id, userId })
      .onConflictDoNothing();
  } else if (notif.userId === userId) {
    await db.update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notificationsTable.id, id));
  }

  res.json({ success: true });
});

/* ── PATCH /notifications/read-all ───────────────────────── */
router.patch("/notifications/read-all", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  await db.update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  const globalNotifs = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.isGlobal, true), isNull(notificationsTable.userId)));

  if (globalNotifs.length > 0) {
    const values = globalNotifs.map(n => ({ notificationId: n.id, userId }));
    await db.insert(notificationReadsTable).values(values).onConflictDoNothing();
  }

  res.json({ success: true });
});

/* ── DELETE /notifications/:id ───────────────────────────── */
router.delete("/notifications/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const { id } = req.params;

  await db.delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));

  res.json({ success: true });
});

export default router;
