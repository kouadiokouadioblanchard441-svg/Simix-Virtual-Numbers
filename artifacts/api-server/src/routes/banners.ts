import { Router, type IRouter } from "express";
import { asc, eq, like } from "drizzle-orm";
import { db, bannersTable, systemSettingsTable } from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ────────────────────────────────────────────────────────────
 * PUBLIC — GET /banners
 * Returns only active banners, ordered by sort_order
 * ──────────────────────────────────────────────────────────── */
router.get("/banners", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(bannersTable)
    .where(eq(bannersTable.isActive, true))
    .orderBy(asc(bannersTable.sortOrder));
  res.json(rows);
});

/* ── PUBLIC — GET /site-content ─────────────────────────── */
router.get("/site-content", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(systemSettingsTable)
    .where(like(systemSettingsTable.key, "content_%"));
  const content: Record<string, string> = {};
  for (const r of rows) content[r.key] = r.value;
  res.json(content);
});

/* ────────────────────────────────────────────────────────────
 * ADMIN — full CRUD (JWT protected)
 * ──────────────────────────────────────────────────────────── */
router.use("/admin/banners", requireAdminJwt);

/* GET /admin/banners — all banners (including inactive) */
router.get("/admin/banners", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(bannersTable)
    .orderBy(asc(bannersTable.sortOrder));
  res.json(rows);
});

/* POST /admin/banners — create */
router.post("/admin/banners", async (req, res): Promise<void> => {
  const { title, subtitle, imageData, imageUrl, linkUrl, linkLabel, bgFrom, bgTo, textColor, isActive, sortOrder } = req.body as {
    title?: string; subtitle?: string; imageData?: string; imageUrl?: string;
    linkUrl?: string; linkLabel?: string; bgFrom?: string; bgTo?: string;
    textColor?: string; isActive?: boolean; sortOrder?: number;
  };

  if (!title?.trim()) { res.status(400).json({ error: "Le titre est requis" }); return; }

  const [banner] = await db.insert(bannersTable).values({
    title: title.trim(),
    subtitle: subtitle?.trim() || null,
    imageData: imageData || null,
    imageUrl: imageUrl?.trim() || null,
    linkUrl: linkUrl?.trim() || null,
    linkLabel: linkLabel?.trim() || null,
    bgFrom: bgFrom || "#7C3AED",
    bgTo: bgTo || "#4C1D95",
    textColor: textColor || "#FFFFFF",
    isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
  }).returning();

  logger.info({ bannerId: banner!.id }, "[Banners] Created");
  res.status(201).json(banner);
});

/* PUT /admin/banners/:id — update */
router.put("/admin/banners/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const { title, subtitle, imageData, imageUrl, linkUrl, linkLabel, bgFrom, bgTo, textColor, isActive, sortOrder } = req.body as {
    title?: string; subtitle?: string; imageData?: string; imageUrl?: string;
    linkUrl?: string; linkLabel?: string; bgFrom?: string; bgTo?: string;
    textColor?: string; isActive?: boolean; sortOrder?: number;
  };

  if (!title?.trim()) { res.status(400).json({ error: "Le titre est requis" }); return; }

  const [banner] = await db.update(bannersTable).set({
    title: title.trim(),
    subtitle: subtitle?.trim() || null,
    ...(imageData !== undefined && { imageData: imageData || null }),
    imageUrl: imageUrl?.trim() || null,
    linkUrl: linkUrl?.trim() || null,
    linkLabel: linkLabel?.trim() || null,
    bgFrom: bgFrom || "#7C3AED",
    bgTo: bgTo || "#4C1D95",
    textColor: textColor || "#FFFFFF",
    isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
  }).where(eq(bannersTable.id, id)).returning();

  if (!banner) { res.status(404).json({ error: "Bannière introuvable" }); return; }
  res.json(banner);
});

/* PATCH /admin/banners/:id/toggle — toggle active */
router.patch("/admin/banners/:id/toggle", async (req, res): Promise<void> => {
  const { id } = req.params;
  const [current] = await db.select().from(bannersTable).where(eq(bannersTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Bannière introuvable" }); return; }

  const [updated] = await db.update(bannersTable)
    .set({ isActive: !current.isActive })
    .where(eq(bannersTable.id, id))
    .returning();
  res.json(updated);
});

/* PATCH /admin/banners/reorder — update sort orders */
router.patch("/admin/banners/reorder", async (req, res): Promise<void> => {
  const { order } = req.body as { order: { id: string; sortOrder: number }[] };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order doit être un tableau" }); return; }

  for (const item of order) {
    await db.update(bannersTable)
      .set({ sortOrder: item.sortOrder })
      .where(eq(bannersTable.id, item.id));
  }
  res.json({ success: true });
});

/* DELETE /admin/banners/:id */
router.delete("/admin/banners/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  await db.delete(bannersTable).where(eq(bannersTable.id, id));
  res.json({ success: true });
});

export default router;
