import { Router, type IRouter } from "express";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, countriesTable } from "@workspace/db";
import { ListCountriesQueryParams } from "@workspace/api-zod";
import { toCountry } from "../lib/serializers";

const router: IRouter = Router();

router.get("/countries", async (req, res): Promise<void> => {
  const parsed = ListCountriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search } = parsed.data;
  const conditions = [];
  if (search && search.length > 0) {
    conditions.push(ilike(countriesTable.name, `%${search}%`));
  }

  const rows = await db
    .select()
    .from(countriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(countriesTable.sortOrder));

  res.json(rows.map(toCountry));
});

router.get("/countries/popular", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(countriesTable)
    .where(eq(countriesTable.popular, true))
    .orderBy(asc(countriesTable.sortOrder));
  res.json(rows.map(toCountry));
});

export default router;
