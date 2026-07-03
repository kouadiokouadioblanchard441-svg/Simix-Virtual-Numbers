import { Router, type IRouter } from "express";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, countriesTable, servicesTable, serviceCountryAvailabilityTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { ListCountriesQueryParams } from "@workspace/api-zod";
import { toCountry } from "../lib/serializers";

const router: IRouter = Router();

/* ─── GET /public/registration-countries
 * Returns countries enabled for registration (enabled = true), sorted by popularity.
 * Used by the registration page to build the dial-code picker.
 * ─────────────────────────────────────────────────────────────────── */
router.get("/public/registration-countries", async (_req, res): Promise<void> => {
  try {
    const { rows } = await pool.query<{
      code: string; dial_code: string; name: string; flag: string;
    }>(
      `SELECT code, dial_code, name, flag
       FROM countries
       WHERE enabled = true
       ORDER BY sort_order ASC`
    );
    res.json(rows.map(r => ({
      code: r.code.toLowerCase(),
      dial: r.dial_code,
      label: r.name,
      flag: r.flag,
    })));
  } catch (err) {
    res.status(500).json({ error: "Impossible de charger les pays." });
  }
});

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
    /* Raw SQL query:
       - LEFT JOIN service_prices: exclude rows where enabled = false (admin toggle)
       - LEFT JOIN service_country_availability: per-service availability count from 5sim
       No row in service_prices (null) or enabled = true both mean the country is available.
       sca.available gives the real-time number count for this specific service. */
    const params: unknown[] = [serviceSlug, serviceSlug];
    let searchClause = "";
    if (search && search.length > 0) {
      params.push(`%${search}%`);
      searchClause = `AND c.name ILIKE $${params.length}`;
    }

    const { rows } = await pool.query<{
      id: string; code: string; name: string; dial_code: string; flag: string;
      available: number; price: number; popular: boolean; sort_order: number;
      enabled: boolean; numbers_enabled: boolean;
    }>(
      `SELECT c.id, c.code, c.name, c.dial_code, c.flag,
              COALESCE(sca.available, 0) AS available,
              COALESCE(sp.price, c.price) AS price,
              c.popular, c.sort_order,
              c.enabled, c.numbers_enabled
       FROM service_country_availability sca
       JOIN countries c
         ON UPPER(c.code) = sca.country_code
       LEFT JOIN service_prices sp
         ON LOWER(c.code) = sp.country_code
        AND sp.service_slug = $1
       WHERE sca.service_slug = $2
         AND sca.available > 0
         AND c.enabled = true
         AND (sp.enabled IS NULL OR sp.enabled = true)
       ${searchClause}
       ORDER BY sca.available DESC, c.sort_order ASC`,
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
      enabled: r.enabled,
      numbersEnabled: r.numbers_enabled,
      adminPriceModified: false,
    })));
    return;
  }

  const nameConditions = [];
  /* Always filter by enabled (registration/deposit countries) */
  nameConditions.push(eq(countriesTable.enabled, true));
  if (search && search.length > 0) {
    nameConditions.push(ilike(countriesTable.name, `%${search}%`));
  }

  const rows = await db
    .select()
    .from(countriesTable)
    .where(and(...nameConditions))
    .orderBy(asc(countriesTable.sortOrder));

  res.json(rows.map(toCountry));
});

router.get("/countries/popular", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(countriesTable)
    .where(and(eq(countriesTable.popular, true), eq(countriesTable.enabled, true)))
    .orderBy(asc(countriesTable.sortOrder));
  res.json(rows.map(toCountry));
});

export default router;
