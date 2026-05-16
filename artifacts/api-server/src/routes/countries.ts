import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db, countriesTable, servicePricesTable, servicesTable } from "@workspace/db";
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

  const nameConditions = [];
  if (search && search.length > 0) {
    nameConditions.push(ilike(countriesTable.name, `%${search}%`));
  }

  if (serviceSlug) {
    /* LEFT JOIN service_prices for this service; exclude rows where
       enabled = false (no row or enabled = true means "available"). */
    const rows = await db
      .select({
        id: countriesTable.id,
        code: countriesTable.code,
        name: countriesTable.name,
        dialCode: countriesTable.dialCode,
        flag: countriesTable.flag,
        available: countriesTable.available,
        price: countriesTable.price,
        popular: countriesTable.popular,
        sortOrder: countriesTable.sortOrder,
        createdAt: countriesTable.createdAt,
      })
      .from(countriesTable)
      .leftJoin(
        servicePricesTable,
        and(
          eq(sql`LOWER(${countriesTable.code})`, servicePricesTable.countryCode),
          eq(servicePricesTable.serviceSlug, serviceSlug),
        ),
      )
      .where(
        and(
          nameConditions.length > 0 ? and(...nameConditions) : undefined,
          or(
            isNull(servicePricesTable.enabled),
            eq(servicePricesTable.enabled, true),
          ),
        ),
      )
      .orderBy(asc(countriesTable.sortOrder));

    res.json(rows.map(toCountry));
    return;
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
