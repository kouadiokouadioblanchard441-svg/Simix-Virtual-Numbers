/**
 * Footer routes
 *  GET  /api/footer                        — public: social links + payment operators
 *  GET  /api/admin/social-links            — admin: all social links
 *  POST /api/admin/social-links            — admin: create
 *  PUT  /api/admin/social-links/:id        — admin: update
 *  DELETE /api/admin/social-links/:id      — admin: delete
 *  GET  /api/admin/payment-operators       — admin: all operators
 *  POST /api/admin/payment-operators       — admin: create
 *  PUT  /api/admin/payment-operators/:id   — admin: update
 *  DELETE /api/admin/payment-operators/:id — admin: delete
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, asc } from "drizzle-orm";
import { db, socialLinksTable, paymentOperatorsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!req.user.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

/* ── PUBLIC ─────────────────────────────────────────────── */

router.get("/footer", async (_req, res): Promise<void> => {
  const [socialLinks, operators] = await Promise.all([
    db.select().from(socialLinksTable)
      .where(eq(socialLinksTable.isActive, true))
      .orderBy(asc(socialLinksTable.sortOrder)),
    db.select().from(paymentOperatorsTable)
      .where(eq(paymentOperatorsTable.isActive, true))
      .orderBy(asc(paymentOperatorsTable.sortOrder)),
  ]);
  res.json({ socialLinks, operators });
});

/* ── ADMIN: SOCIAL LINKS ────────────────────────────────── */

router.get("/admin/social-links", requireAdminJwt, requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const links = await db.select().from(socialLinksTable).orderBy(asc(socialLinksTable.sortOrder));
  res.json({ links });
});

router.post("/admin/social-links", requireAdminJwt, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { platform, name, url, color, isActive, sortOrder } = req.body as {
    platform: string; name: string; url: string;
    color?: string; isActive?: boolean; sortOrder?: number;
  };
  if (!platform || !name || !url) { res.status(400).json({ error: "platform, name, url required" }); return; }

  const [link] = await db.insert(socialLinksTable).values({
    platform: platform.toLowerCase().trim(),
    name: name.trim(),
    url: url.trim(),
    color: color ?? "#8B5CF6",
    isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
  }).returning();
  res.json({ link });
});

router.put("/admin/social-links/:id", requireAdminJwt, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const data = req.body as Partial<{ platform: string; name: string; url: string; color: string; isActive: boolean; sortOrder: number }>;
  const [link] = await db.update(socialLinksTable).set(data).where(eq(socialLinksTable.id, id)).returning();
  if (!link) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ link });
});

router.delete("/admin/social-links/:id", requireAdminJwt, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  await db.delete(socialLinksTable).where(eq(socialLinksTable.id, id));
  res.json({ success: true });
});

/* ── ADMIN: PAYMENT OPERATORS ───────────────────────────── */

router.get("/admin/payment-operators", requireAdminJwt, requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const operators = await db.select().from(paymentOperatorsTable).orderBy(asc(paymentOperatorsTable.sortOrder));
  res.json({ operators });
});

router.post("/admin/payment-operators", requireAdminJwt, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, logoUrl, logoData, websiteUrl, countries, bgColor, isActive, sortOrder } = req.body as {
    name: string; logoUrl?: string; logoData?: string; websiteUrl?: string;
    countries?: string; bgColor?: string; isActive?: boolean; sortOrder?: number;
  };
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const [op] = await db.insert(paymentOperatorsTable).values({
    name: name.trim(),
    logoUrl: logoUrl?.trim() ?? null,
    logoData: logoData ?? null,
    websiteUrl: websiteUrl?.trim() ?? null,
    countries: countries?.trim() ?? null,
    bgColor: bgColor ?? "#1a1a2e",
    isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
  }).returning();
  res.json({ operator: op });
});

router.put("/admin/payment-operators/:id", requireAdminJwt, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const data = req.body as Partial<{
    name: string; logoUrl: string; logoData: string; websiteUrl: string;
    countries: string; bgColor: string; isActive: boolean; sortOrder: number;
  }>;
  const [op] = await db.update(paymentOperatorsTable).set(data).where(eq(paymentOperatorsTable.id, id)).returning();
  if (!op) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ operator: op });
});

router.delete("/admin/payment-operators/:id", requireAdminJwt, requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  await db.delete(paymentOperatorsTable).where(eq(paymentOperatorsTable.id, id));
  res.json({ success: true });
});

export default router;
