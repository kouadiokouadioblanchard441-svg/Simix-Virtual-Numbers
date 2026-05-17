import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db, countriesTable, servicesTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { ListCountriesQueryParams } from "@workspace/api-zod";
import { toCountry } from "../lib/serializers";

const router: IRouter = Router();

router.get("/countries", async (req, res): Promise<void> => {
  const parsed = ListCountriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, serviceId } = parsed.data;

  /* If a serviceId is provided, look up its slug so we can filter
     out countries that are explicitly disabled for that service. */
  let serviceSlug: string | undefined;
  if (serviceId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(serviceId)) {
      const [svc] = await db
        .select({ slug: servicesTable.slug })
        .from(servicesTable)
        .where(eq(servicesTable.id, serviceId))
        .limit(1);
      serviceSlug = svc?.slug;
    }
  }

  if (serviceSlug) {
    /* Raw SQL query: LEFT JOIN service_prices; exclude rows where enabled = false.
       No row (null) or enabled = true both mean the country is available. */
    const params: unknown[] = [serviceSlug];
    let searchClause = "";
    if (search && search.length > 0) {
      params.push(`%${search}%`);
      searchClause = `AND c.name ILIKE $${params.length}`;
    }

    const { rows } = await pool.query<{
      id: string; code: string; name: string; dial_code: string; flag: string;
      available: number; price: number; popular: boolean; sort_order: number;
    }>(
      `SELECT c.id, c.code, c.name, c.dial_code, c.flag,
              c.available, c.price, c.popular, c.sort_order
       FROM countries c
       LEFT JOIN service_prices sp
         ON LOWER(c.code) = sp.country_code
        AND sp.service_slug = $1
       WHERE (sp.enabled IS NULL OR sp.enabled = true)
       ${searchClause}
       ORDER BY c.sort_order ASC`,
      params,
    );

    res.json(rows.map(r => toCountry({
      id: r.id,
      code: r.code,
      name: r.name,
      dialCode: r.dial_code,
      flag: r.flag,
      available: r.available,
      price: r.price,
      popular: r.popular,
      sortOrder: r.sort_order,
    })));
    return;
  }

  const nameConditions = [];
  if (search && search.length > 0) {
    nameConditions.push(ilike(countriesTable.name, `%${search}%`));
  }

  const rows = await db
    .select()
    .from(countriesTable)
    .where(nameConditions.length > 0 ? and(...nameConditions) : undefined)
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
