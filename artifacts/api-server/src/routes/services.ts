import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { db, servicesTable } from "@workspace/db";
import { ListServicesQueryParams } from "@workspace/api-zod";
import { toService } from "../lib/serializers";

const router: IRouter = Router();

router.get("/services", async (req, res): Promise<void> => {
  const parsed = ListServicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, category } = parsed.data;
  const conditions = [];
  if (search && search.length > 0) {
    conditions.push(ilike(servicesTable.name, `%${search}%`));
  }
  if (category && category.length > 0) {
    conditions.push(eq(servicesTable.category, category));
  }

  const rows = await db
    .select()
    .from(servicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(servicesTable.sortOrder));

  res.json(rows.map(toService));
});

router.get("/services/popular", async (_req, res): Promise<void> => {
  /* Return services marked popular; if none exist, fall back to the top 12
     by available number count (so the dashboard always has content). */
  let rows = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.popular, true))
    .orderBy(asc(servicesTable.sortOrder))
    .limit(12);

  if (rows.length === 0) {
    rows = await db
      .select()
      .from(servicesTable)
      .where(eq(servicesTable.enabled, true))
      .orderBy(desc(servicesTable.available), asc(servicesTable.name))
      .limit(12);
  }

  res.json(rows.map(toService));
});

export default router;
