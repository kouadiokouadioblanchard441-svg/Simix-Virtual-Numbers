/**
 * Admin Payment Routing — CRUD for gateways, operators, routes + routing engine
 * All routes: /api/admin/payment-routing/*
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, asc, count, gte, sql } from "drizzle-orm";
import {
  db,
  mobileOperatorsTable,
  paymentGatewaysTable,
  paymentRoutesTable,
  paymentRouteLogsTable,
  countriesTable,
  systemSettingsTable,
  transactionsTable,
} from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(requireAdminJwt);

function requireAdmin(req: Request, res: Response, next: () => void): void {
  if (req.adminPayload) { next(); return; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Accès réservé aux administrateurs" }); return; }
  next();
}

function adminId(req: Request): string {
  return req.adminPayload?.sub ?? req.user?.id ?? "unknown";
}

/* ═══════════════════════════════════════════════════════
   ROUTING ENGINE — used by wallet/payment routes
   ═══════════════════════════════════════════════════════ */

export interface ResolvedRoute {
  gatewayId: string;
  gatewaySlug: string;
  gatewayName: string;
  apiKey: string | null;
  apiSecret: string | null;
  apiUrl: string | null;
  priority: "primary" | "secondary" | "tertiary";
  routeId: string;
}

/**
 * Resolve which payment gateway to use for a given country/operator/type.
 * Returns null if no active route found or if route is in maintenance.
 */
export async function resolvePaymentRoute(
  countryCode: string,
  operatorSlug: string,
  transactionType: "deposit" | "withdrawal" = "deposit",
): Promise<ResolvedRoute | null> {
  const [route] = await db
    .select()
    .from(paymentRoutesTable)
    .where(
      and(
        eq(paymentRoutesTable.countryCode, countryCode.toUpperCase()),
        eq(paymentRoutesTable.operatorSlug, operatorSlug.toLowerCase()),
        eq(paymentRoutesTable.transactionType, transactionType),
        eq(paymentRoutesTable.active, true),
      ),
    )
    .limit(1);

  if (!route) return null;

  if (route.maintenanceMode) return null;

  const gatewayIds = [
    { id: route.primaryGatewayId, priority: "primary" as const },
    { id: route.secondaryGatewayId, priority: "secondary" as const },
    { id: route.tertiaryGatewayId, priority: "tertiary" as const },
  ].filter(g => g.id != null);

  for (const { id, priority } of gatewayIds) {
    if (!id) continue;
    const [gw] = await db
      .select()
      .from(paymentGatewaysTable)
      .where(and(eq(paymentGatewaysTable.id, id), eq(paymentGatewaysTable.active, true)))
      .limit(1);

    if (gw) {
      return {
        gatewayId: gw.id,
        gatewaySlug: gw.slug,
        gatewayName: gw.name,
        apiKey: gw.apiKey,
        apiSecret: gw.apiSecret,
        apiUrl: gw.apiUrl,
        priority,
        routeId: route.id,
      };
    }
  }

  return null;
}

/* ═══════════════════════════════════════════════════════
   MOBILE OPERATORS
   ═══════════════════════════════════════════════════════ */

router.get("/admin/payment-routing/operators", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(mobileOperatorsTable).orderBy(asc(mobileOperatorsTable.sortOrder));
  res.json({ operators: rows });
});

router.post("/admin/payment-routing/operators", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, slug, logoUrl, color, countryCodes, active, sortOrder } = req.body as {
    name: string; slug: string; logoUrl?: string; color?: string;
    countryCodes?: string[]; active?: boolean; sortOrder?: number;
  };
  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: "Nom et slug requis" });
    return;
  }
  const [op] = await db.insert(mobileOperatorsTable).values({
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    logoUrl: logoUrl || null,
    color: color || "#6B7280",
    countryCodes: countryCodes ?? [],
    active: active ?? true,
    sortOrder: sortOrder ?? 100,
  }).returning();
  logger.info({ id: op!.id, name }, "[payment-routing] Operator created");
  res.status(201).json(op);
});

router.put("/admin/payment-routing/operators/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { name, slug, logoUrl, color, countryCodes, active, sortOrder } = req.body as Partial<{
    name: string; slug: string; logoUrl: string; color: string;
    countryCodes: string[]; active: boolean; sortOrder: number;
  }>;
  const [op] = await db.update(mobileOperatorsTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({
      ...(name && { name: name.trim() }),
      ...(slug && { slug: slug.trim().toLowerCase() }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(color && { color }),
      ...(countryCodes !== undefined && { countryCodes }),
      ...(active !== undefined && { active }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    } as any)
    .where(eq(mobileOperatorsTable.id, id))
    .returning();
  if (!op) { res.status(404).json({ error: "Opérateur introuvable" }); return; }
  res.json(op);
});

router.delete("/admin/payment-routing/operators/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await db.delete(mobileOperatorsTable).where(eq(mobileOperatorsTable.id, req.params.id as string));
  res.json({ success: true });
});

/* ═══════════════════════════════════════════════════════
   PAYMENT GATEWAYS
   ═══════════════════════════════════════════════════════ */

router.get("/admin/payment-routing/gateways", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(paymentGatewaysTable).orderBy(asc(paymentGatewaysTable.name));
  /* Mask API keys in list view */
  const masked = rows.map(g => ({
    ...g,
    apiKey: g.apiKey ? `${g.apiKey.slice(0, 4)}${"•".repeat(Math.max(0, g.apiKey.length - 4))}` : null,
    apiSecret: g.apiSecret ? "•".repeat(12) : null,
    webhookSecret: g.webhookSecret ? "•".repeat(12) : null,
  }));
  res.json({ gateways: masked });
});

router.post("/admin/payment-routing/gateways", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const {
    name, slug, logoUrl, apiUrl, apiKey, apiSecret, webhookSecret,
    type, supportedCountries, supportedOperators, active, testMode, notes,
  } = req.body as {
    name: string; slug: string; logoUrl?: string; apiUrl?: string;
    apiKey?: string; apiSecret?: string; webhookSecret?: string;
    type?: string; supportedCountries?: string[]; supportedOperators?: string[];
    active?: boolean; testMode?: boolean; notes?: string;
  };
  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: "Nom et slug requis" });
    return;
  }
  const [gw] = await db.insert(paymentGatewaysTable).values({
    name: name.trim(),
    slug: slug.trim().toLowerCase(),
    logoUrl: logoUrl || null,
    apiUrl: apiUrl || null,
    apiKey: apiKey || null,
    apiSecret: apiSecret || null,
    webhookSecret: webhookSecret || null,
    type: type || "both",
    supportedCountries: supportedCountries ?? [],
    supportedOperators: supportedOperators ?? [],
    active: active ?? true,
    testMode: testMode ?? false,
    notes: notes || null,
  }).returning();
  logger.info({ id: gw!.id, name, adminId: adminId(req) }, "[payment-routing] Gateway created");
  res.status(201).json({ ...gw, apiKey: undefined, apiSecret: undefined });
});

router.put("/admin/payment-routing/gateways/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const body = req.body as Partial<{
    name: string; slug: string; logoUrl: string; apiUrl: string;
    apiKey: string; apiSecret: string; webhookSecret: string;
    type: string; supportedCountries: string[]; supportedOperators: string[];
    active: boolean; testMode: boolean; notes: string;
  }>;
  const [gw] = await db.update(paymentGatewaysTable)
    .set({
      ...(body.name && { name: body.name.trim() }),
      ...(body.slug && { slug: body.slug.trim().toLowerCase() }),
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
      ...(body.apiUrl !== undefined && { apiUrl: body.apiUrl }),
      ...(body.apiKey !== undefined && body.apiKey !== "••••••••••••" && { apiKey: body.apiKey }),
      ...(body.apiSecret !== undefined && body.apiSecret !== "••••••••••••" && { apiSecret: body.apiSecret }),
      ...(body.webhookSecret !== undefined && body.webhookSecret !== "••••••••••••" && { webhookSecret: body.webhookSecret }),
      ...(body.type && { type: body.type }),
      ...(body.supportedCountries !== undefined && { supportedCountries: body.supportedCountries }),
      ...(body.supportedOperators !== undefined && { supportedOperators: body.supportedOperators }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.testMode !== undefined && { testMode: body.testMode }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    })
    .where(eq(paymentGatewaysTable.id, id))
    .returning();
  if (!gw) { res.status(404).json({ error: "Passerelle introuvable" }); return; }
  logger.info({ id, adminId: adminId(req) }, "[payment-routing] Gateway updated");
  res.json({ ...gw, apiKey: undefined, apiSecret: undefined });
});

router.delete("/admin/payment-routing/gateways/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await db.delete(paymentGatewaysTable).where(eq(paymentGatewaysTable.id, req.params.id as string));
  logger.info({ id: req.params.id, adminId: adminId(req) }, "[payment-routing] Gateway deleted");
  res.json({ success: true });
});

/* ── Test gateway connectivity ─── */
router.post("/admin/payment-routing/gateways/:id/test", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.id, id)).limit(1);
  if (!gw) { res.status(404).json({ error: "Passerelle introuvable" }); return; }

  const slug = gw.slug.toLowerCase();
  const start = Date.now();

  /* ── PawaPay: use dedicated client test ── */
  if (slug === "pawapay" || slug.includes("pawapay")) {
    /* Credential resolution centralized in lib/gateway-credentials.ts —
     * route override → system_settings (DB, authoritative) → env var. */
    const { resolvePawaPayCredentials } = await import("../lib/gateway-credentials");
    const creds = await resolvePawaPayCredentials(gw.apiKey);
    if (!creds) {
      res.json({ status: "no_token", message: "Aucun token PawaPay configuré. Ajoutez la clé API dans les paramètres système (Paramètres → pawapay_api_token)." });
      return;
    }
    try {
      const { PawaPayClient } = await import("../lib/pawapay");
      const env = creds.env;
      const client = new PawaPayClient(creds.token, env);
      const config = await client.getActiveConfiguration();
      const responseTimeMs = Date.now() - start;
      const providers = config.countries?.flatMap((c: { providers?: { nameDisplayedToCustomer?: string; provider: string }[]; country: string }) =>
        (c.providers ?? []).map((p: { nameDisplayedToCustomer?: string; provider: string }) => p.nameDisplayedToCustomer ?? p.provider),
      ) ?? [];

      await db.insert(paymentRouteLogsTable).values({
        gatewayId: gw.id, eventType: "test", status: "success",
        responseTimeMs, adminId: adminId(req),
        metadata: { env, operatorCount: providers.length },
      });

      res.json({
        status: "connected",
        responseTimeMs,
        message: `PawaPay connecté (${responseTimeMs}ms) — ${providers.length} opérateur(s) actif(s) — env: ${env}`,
        details: { env, operatorCount: providers.length, operators: providers.slice(0, 8) },
      });
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      await db.insert(paymentRouteLogsTable).values({
        gatewayId: gw.id, eventType: "test", status: "error",
        responseTimeMs, errorMessage: (err as Error).message, adminId: adminId(req),
      });
      res.json({ status: "error", responseTimeMs, message: `Erreur PawaPay: ${(err as Error).message}` });
    }
    return;
  }

  /* ── Clapay: use dedicated client test ── */
  if (slug === "clapay" || slug.includes("clapay")) {
    /* Credential resolution centralized in lib/gateway-credentials.ts —
     * route override → system_settings (DB, authoritative) → env var. */
    const { resolveClapayCredentials } = await import("../lib/gateway-credentials");
    const creds = await resolveClapayCredentials(gw.apiKey, gw.apiUrl);
    if (!creds) {
      res.json({ status: "no_token", message: "Aucun token Clapay configuré. Ajoutez la clé API dans les paramètres système (Paramètres → clapay_api_token)." });
      return;
    }
    try {
      const { ClapayClient } = await import("../lib/clapay");
      const client = new ClapayClient(creds.token, creds.baseUrl);
      const countries = await client.getCountries();
      const responseTimeMs = Date.now() - start;

      await db.insert(paymentRouteLogsTable).values({
        gatewayId: gw.id, eventType: "test", status: "success",
        responseTimeMs, adminId: adminId(req),
        metadata: { countryCount: countries.length },
      });

      res.json({
        status: "connected",
        responseTimeMs,
        message: `Clapay connecté (${responseTimeMs}ms) — ${countries.length} pays disponible(s)`,
        details: { countryCount: countries.length, countries: countries.slice(0, 8).map((c: { code: string; name: string }) => `${c.name} (${c.code})`) },
      });
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      await db.insert(paymentRouteLogsTable).values({
        gatewayId: gw.id, eventType: "test", status: "error",
        responseTimeMs, errorMessage: (err as Error).message, adminId: adminId(req),
      });
      res.json({ status: "error", responseTimeMs, message: `Erreur Clapay: ${(err as Error).message}` });
    }
    return;
  }

  /* ── Generic gateway: HTTP probe ── */
  if (!gw.apiUrl) {
    res.json({ status: "no_url", message: "Aucune URL API configurée pour ce fournisseur." });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const testRes = await fetch(gw.apiUrl, {
      method: "GET",
      headers: {
        ...(gw.apiKey ? { Authorization: `Bearer ${gw.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;

    await db.insert(paymentRouteLogsTable).values({
      gatewayId: gw.id, eventType: "test",
      status: testRes.ok ? "success" : "error",
      responseTimeMs, errorMessage: testRes.ok ? null : `HTTP ${testRes.status}`,
      adminId: adminId(req),
    });

    res.json({
      status: testRes.ok ? "connected" : "error",
      httpStatus: testRes.status,
      responseTimeMs,
      message: testRes.ok ? `Connecté (${responseTimeMs}ms)` : `Erreur HTTP ${testRes.status}`,
    });
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const isTimeout = (err as Error).name === "AbortError";
    await db.insert(paymentRouteLogsTable).values({
      gatewayId: gw.id, eventType: "test",
      status: isTimeout ? "timeout" : "error",
      responseTimeMs, errorMessage: (err as Error).message, adminId: adminId(req),
    });
    res.json({
      status: isTimeout ? "timeout" : "error",
      responseTimeMs,
      message: isTimeout ? "Timeout (>8s)" : `Erreur: ${(err as Error).message}`,
    });
  }
});

/* ═══════════════════════════════════════════════════════
   PAYMENT ROUTES (routing table)
   ═══════════════════════════════════════════════════════ */

router.get("/admin/payment-routing/routes", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const countryCode = req.query.country as string | undefined;
  const operatorSlug = req.query.operator as string | undefined;
  const type = req.query.type as string | undefined;

  const routes = await db.select().from(paymentRoutesTable).orderBy(
    asc(paymentRoutesTable.countryCode),
    asc(paymentRoutesTable.operatorSlug),
  );

  const filtered = routes.filter(r => {
    if (countryCode && r.countryCode !== countryCode.toUpperCase()) return false;
    if (operatorSlug && r.operatorSlug !== operatorSlug.toLowerCase()) return false;
    if (type && r.transactionType !== type) return false;
    return true;
  });

  const [gateways, operators] = await Promise.all([
    db.select({ id: paymentGatewaysTable.id, name: paymentGatewaysTable.name, slug: paymentGatewaysTable.slug, active: paymentGatewaysTable.active }).from(paymentGatewaysTable),
    db.select({ id: mobileOperatorsTable.id, name: mobileOperatorsTable.name, slug: mobileOperatorsTable.slug }).from(mobileOperatorsTable),
  ]);

  const gwMap = new Map(gateways.map(g => [g.id, g]));
  const opMap = new Map(operators.map(o => [o.slug, o]));

  const enriched = filtered.map(r => ({
    ...r,
    primaryGateway: r.primaryGatewayId ? gwMap.get(r.primaryGatewayId) : null,
    secondaryGateway: r.secondaryGatewayId ? gwMap.get(r.secondaryGatewayId) : null,
    tertiaryGateway: r.tertiaryGatewayId ? gwMap.get(r.tertiaryGatewayId) : null,
    operator: opMap.get(r.operatorSlug) ?? null,
  }));

  res.json({ routes: enriched, gateways, operators });
});

router.post("/admin/payment-routing/routes", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const {
    countryCode, operatorSlug, transactionType,
    primaryGatewayId, secondaryGatewayId, tertiaryGatewayId,
    active, maintenanceMode, maintenanceMessage, notes,
  } = req.body as {
    countryCode: string; operatorSlug: string; transactionType?: string;
    primaryGatewayId?: string; secondaryGatewayId?: string; tertiaryGatewayId?: string;
    active?: boolean; maintenanceMode?: boolean; maintenanceMessage?: string; notes?: string;
  };

  if (!countryCode?.trim() || !operatorSlug?.trim()) {
    res.status(400).json({ error: "Pays et opérateur requis" });
    return;
  }

  const [route] = await db.insert(paymentRoutesTable).values({
    countryCode: countryCode.trim().toUpperCase(),
    operatorSlug: operatorSlug.trim().toLowerCase(),
    transactionType: transactionType || "deposit",
    primaryGatewayId: primaryGatewayId || null,
    secondaryGatewayId: secondaryGatewayId || null,
    tertiaryGatewayId: tertiaryGatewayId || null,
    active: active ?? true,
    maintenanceMode: maintenanceMode ?? false,
    maintenanceMessage: maintenanceMessage || null,
    notes: notes || null,
  }).returning();

  await db.insert(paymentRouteLogsTable).values({
    routeId: route!.id,
    eventType: "route_created",
    status: "success",
    adminId: adminId(req),
    metadata: { countryCode, operatorSlug, transactionType },
  });

  logger.info({ id: route!.id, countryCode, operatorSlug, adminId: adminId(req) }, "[payment-routing] Route created");
  res.status(201).json(route);
});

/* ── Upsert route — create or update for a country+operator+type ─── */
router.post("/admin/payment-routing/routes/upsert", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const {
    countryCode, operatorSlug, transactionType = "deposit",
    primaryGatewayId, secondaryGatewayId, tertiaryGatewayId,
  } = req.body as {
    countryCode: string; operatorSlug: string; transactionType?: string;
    primaryGatewayId?: string | null; secondaryGatewayId?: string | null; tertiaryGatewayId?: string | null;
  };

  if (!countryCode?.trim() || !operatorSlug?.trim()) {
    res.status(400).json({ error: "Pays et opérateur requis" });
    return;
  }

  const cc = countryCode.trim().toUpperCase();
  const op = operatorSlug.trim().toLowerCase();
  const type = transactionType || "deposit";

  const [existing] = await db
    .select()
    .from(paymentRoutesTable)
    .where(
      and(
        eq(paymentRoutesTable.countryCode, cc),
        eq(paymentRoutesTable.operatorSlug, op),
        eq(paymentRoutesTable.transactionType, type),
      ),
    )
    .limit(1);

  let route;
  if (existing) {
    [route] = await db.update(paymentRoutesTable)
      .set({
        ...(primaryGatewayId !== undefined && { primaryGatewayId: primaryGatewayId || null }),
        ...(secondaryGatewayId !== undefined && { secondaryGatewayId: secondaryGatewayId || null }),
        ...(tertiaryGatewayId !== undefined && { tertiaryGatewayId: tertiaryGatewayId || null }),
        updatedAt: new Date(),
      })
      .where(eq(paymentRoutesTable.id, existing.id))
      .returning();
    await db.insert(paymentRouteLogsTable).values({
      routeId: existing.id,
      eventType: "gateway_switch",
      status: "success",
      adminId: adminId(req),
      metadata: { countryCode: cc, operatorSlug: op, primaryGatewayId: primaryGatewayId ?? null },
    });
  } else {
    [route] = await db.insert(paymentRoutesTable).values({
      countryCode: cc,
      operatorSlug: op,
      transactionType: type,
      primaryGatewayId: primaryGatewayId || null,
      secondaryGatewayId: secondaryGatewayId || null,
      tertiaryGatewayId: tertiaryGatewayId || null,
      active: true,
    }).returning();
    await db.insert(paymentRouteLogsTable).values({
      routeId: route!.id,
      eventType: "route_created",
      status: "success",
      adminId: adminId(req),
      metadata: { countryCode: cc, operatorSlug: op, primaryGatewayId: primaryGatewayId ?? null },
    });
  }

  logger.info({ countryCode: cc, operatorSlug: op, primaryGatewayId, adminId: adminId(req) }, "[payment-routing] Route upserted");
  res.json({ success: true, route });
});

router.put("/admin/payment-routing/routes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const body = req.body as Partial<{
    countryCode: string; operatorSlug: string; transactionType: string;
    primaryGatewayId: string | null; secondaryGatewayId: string | null; tertiaryGatewayId: string | null;
    active: boolean; maintenanceMode: boolean; maintenanceMessage: string; notes: string;
  }>;

  const [route] = await db.update(paymentRoutesTable)
    .set({
      ...(body.countryCode && { countryCode: body.countryCode.toUpperCase() }),
      ...(body.operatorSlug && { operatorSlug: body.operatorSlug.toLowerCase() }),
      ...(body.transactionType && { transactionType: body.transactionType }),
      ...(body.primaryGatewayId !== undefined && { primaryGatewayId: body.primaryGatewayId }),
      ...(body.secondaryGatewayId !== undefined && { secondaryGatewayId: body.secondaryGatewayId }),
      ...(body.tertiaryGatewayId !== undefined && { tertiaryGatewayId: body.tertiaryGatewayId }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
      ...(body.maintenanceMessage !== undefined && { maintenanceMessage: body.maintenanceMessage }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date(),
    })
    .where(eq(paymentRoutesTable.id, id))
    .returning();

  if (!route) { res.status(404).json({ error: "Route introuvable" }); return; }

  await db.insert(paymentRouteLogsTable).values({
    routeId: id,
    eventType: "route_updated",
    status: "success",
    adminId: adminId(req),
    metadata: body as Record<string, unknown>,
  });

  logger.info({ id, adminId: adminId(req) }, "[payment-routing] Route updated");
  res.json(route);
});

router.delete("/admin/payment-routing/routes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await db.delete(paymentRoutesTable).where(eq(paymentRoutesTable.id, req.params.id as string));
  res.json({ success: true });
});

/* ── Quick switch: change primary gateway for a route ─── */
router.post("/admin/payment-routing/routes/:id/switch", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { gatewayId } = req.body as { gatewayId: string };

  const [route] = await db.update(paymentRoutesTable)
    .set({ primaryGatewayId: gatewayId, updatedAt: new Date() })
    .where(eq(paymentRoutesTable.id, id))
    .returning();

  if (!route) { res.status(404).json({ error: "Route introuvable" }); return; }

  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.id, gatewayId)).limit(1);

  await db.insert(paymentRouteLogsTable).values({
    routeId: id,
    gatewayId,
    eventType: "gateway_switch",
    status: "success",
    adminId: adminId(req),
    metadata: { previousGateway: route.primaryGatewayId, newGateway: gatewayId, gatewayName: gw?.name },
  });

  logger.info({ id, gatewayId, adminId: adminId(req) }, "[payment-routing] Gateway switched");
  res.json({ success: true, route, gateway: gw });
});

/* ── Toggle maintenance mode ─── */
router.post("/admin/payment-routing/routes/:id/maintenance", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as Record<string, string>;
  const { maintenanceMode, maintenanceMessage } = req.body as { maintenanceMode: boolean; maintenanceMessage?: string };

  const [route] = await db.update(paymentRoutesTable)
    .set({ maintenanceMode, maintenanceMessage: maintenanceMessage || null, updatedAt: new Date() })
    .where(eq(paymentRoutesTable.id, id))
    .returning();

  if (!route) { res.status(404).json({ error: "Route introuvable" }); return; }

  await db.insert(paymentRouteLogsTable).values({
    routeId: id,
    eventType: maintenanceMode ? "maintenance_on" : "maintenance_off",
    status: "success",
    adminId: adminId(req),
  });

  res.json({ success: true, route });
});

/* ═══════════════════════════════════════════════════════
   LOGS
   ═══════════════════════════════════════════════════════ */

router.get("/admin/payment-routing/logs", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const eventType = req.query.eventType as string | undefined;
  const status = req.query.status as string | undefined;

  const rows = await db.select().from(paymentRouteLogsTable)
    .where(
      and(
        eventType ? eq(paymentRouteLogsTable.eventType, eventType) : undefined,
        status ? eq(paymentRouteLogsTable.status, status) : undefined,
      ),
    )
    .orderBy(desc(paymentRouteLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(paymentRouteLogsTable);

  res.json({ logs: rows, total: Number(total) });
});

/* ═══════════════════════════════════════════════════════
   MATRIX — full country → operator → gateway view
   ═══════════════════════════════════════════════════════ */
router.get("/admin/payment-routing/matrix", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [operators, gateways, routes, countries] = await Promise.all([
    db.select().from(mobileOperatorsTable).orderBy(asc(mobileOperatorsTable.sortOrder)),
    db.select({
      id: paymentGatewaysTable.id,
      name: paymentGatewaysTable.name,
      slug: paymentGatewaysTable.slug,
      active: paymentGatewaysTable.active,
      logoUrl: paymentGatewaysTable.logoUrl,
      testMode: paymentGatewaysTable.testMode,
    }).from(paymentGatewaysTable).orderBy(asc(paymentGatewaysTable.name)),
    db.select().from(paymentRoutesTable).orderBy(
      asc(paymentRoutesTable.countryCode),
      asc(paymentRoutesTable.operatorSlug),
    ),
    db.select({ code: countriesTable.code, name: countriesTable.name, flag: countriesTable.flag }).from(countriesTable),
  ]);

  /* Build country → operator slugs map */
  const countryOpMap = new Map<string, string[]>();
  for (const op of operators) {
    for (const cc of (op.countryCodes as string[])) {
      if (!countryOpMap.has(cc)) countryOpMap.set(cc, []);
      countryOpMap.get(cc)!.push(op.slug);
    }
  }

  /* Country info lookup */
  const countryInfo = new Map(countries.map(c => [c.code, { name: c.name, flag: c.flag }]));

  const countryList = [...countryOpMap.entries()]
    .map(([code, opSlugs]) => ({
      code,
      name: countryInfo.get(code)?.name ?? code,
      flag: countryInfo.get(code)?.flag ?? "🌍",
      operatorSlugs: opSlugs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ countries: countryList, operators, gateways, routes });
});

/* ═══════════════════════════════════════════════════════
   PAWAPAY CORRESPONDENT SYNC
   ═══════════════════════════════════════════════════════ */

/**
 * POST /admin/payment-routing/pawapay-sync
 * Calls PawaPay getActiveConfiguration() and upserts mobile_operators + payment_routes
 * for every active correspondent found on the merchant account.
 */
router.post("/admin/payment-routing/pawapay-sync", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    /* 1. Resolve PawaPay token + env */
    let token = process.env.PAWAPAY_API_TOKEN ?? null;
    let envStr = process.env.PAWAPAY_ENV?.trim().toLowerCase() ?? null;

    if (!token || !envStr) {
      const [tokenRow] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "pawapay_api_token")).limit(1);
      const [envRow]   = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "pawapay_env")).limit(1);
      if (!token)   token   = tokenRow?.value?.trim() || null;
      if (!envStr)  envStr  = envRow?.value?.trim().toLowerCase() || null;
    }

    if (!token) {
      res.status(400).json({ error: "Aucun token PawaPay configuré. Ajoutez la clé 'pawapay_api_token' dans les Paramètres système." });
      return;
    }

    /* 2. Find PawaPay gateway in DB */
    const allGateways = await db.select().from(paymentGatewaysTable);
    const gw = allGateways.find(g => g.slug.toLowerCase().includes("pawapay"));
    if (!gw) {
      res.status(400).json({ error: "Passerelle PawaPay introuvable. Créez-la d'abord dans l'onglet Passerelles (slug doit contenir 'pawapay')." });
      return;
    }

    /* 3. Fetch active configuration from PawaPay */
    const { PawaPayClient, ISO2_TO_ISO3 } = await import("../lib/pawapay");
    const env: "sandbox" | "production" = envStr === "production" ? "production" : "sandbox";
    const client = new PawaPayClient(token, env);
    const config = await client.getActiveConfiguration();

    /* 4. Build ISO3 → ISO2 reverse map */
    const iso3ToIso2: Record<string, string> = {};
    for (const [iso2, iso3] of Object.entries(ISO2_TO_ISO3)) {
      iso3ToIso2[iso3] = iso2;
    }

    /* 5. Known canonical operator slugs */
    const KNOWN_SLUGS = [
      "mtn", "orange", "wave", "moov", "airtel", "mpesa", "free",
      "expresso", "tmoney", "flooz", "mvola", "zamtel", "vodacom", "tigo",
      "africell", "glo", "vodafone", "econet", "unitel", "tnm", "mobicash", "iam",
    ];

    const BRAND_COLORS: Record<string, string> = {
      orange: "#FF7A00", mtn: "#FFCC00", wave: "#1E90FF", moov: "#00A651",
      airtel: "#FF0000", mpesa: "#00A550", vodacom: "#E60000", vodafone: "#E60000",
      tigo: "#009BDE", tmoney: "#00A3E0", flooz: "#FF6B00", mvola: "#007BC3",
      free: "#CD0000", expresso: "#5B2D8E", zamtel: "#00843D", econet: "#005B33",
      unitel: "#C8102E", tnm: "#0072CE", africell: "#00AEEF",
      mobicash: "#009E60", iam: "#D4002C",
    };

    function providerToSlug(provider: string): string {
      const s = provider.toLowerCase();
      for (const slug of KNOWN_SLUGS) {
        if (s === slug || s.startsWith(slug + "_") || s.endsWith("_" + slug) || s.includes("_" + slug + "_")) return slug;
      }
      return s.split("_")[0] ?? s;
    }

    /* 6. Build aggregated operator map: slug → { name, color, countryCodes } */
    interface OpEntry { name: string; color: string; countryCodes: Set<string> }
    const operatorMap = new Map<string, OpEntry>();
    const routePairs: { countryCode: string; slug: string }[] = [];
    const errors: string[] = [];

    for (const countryData of config.countries ?? []) {
      const iso3 = countryData.country;
      const iso2 = iso3ToIso2[iso3];
      if (!iso2) { errors.push(`ISO-3 inconnu: ${iso3}`); continue; }

      for (const prov of countryData.providers ?? []) {
        const slug = providerToSlug(prov.provider);
        const displayName = prov.nameDisplayedToCustomer ?? prov.provider;
        const color = BRAND_COLORS[slug] ?? "#7C3AED";

        if (!operatorMap.has(slug)) {
          operatorMap.set(slug, { name: displayName, color, countryCodes: new Set() });
        }
        operatorMap.get(slug)!.countryCodes.add(iso2);
        routePairs.push({ countryCode: iso2, slug });
      }
    }

    /* 7. Upsert mobile_operators */
    let operatorsCreated = 0;
    let operatorsUpdated = 0;
    const existingOps = await db.select().from(mobileOperatorsTable);
    const existingOpMap = new Map(existingOps.map(o => [o.slug, o]));

    for (const [slug, entry] of operatorMap) {
      const countryCodes = Array.from(entry.countryCodes);
      const existing = existingOpMap.get(slug);

      if (existing) {
        const merged = Array.from(new Set([...(existing.countryCodes as string[]), ...countryCodes]));
        await db.update(mobileOperatorsTable)
          .set({ color: entry.color, countryCodes: merged, active: true })
          .where(eq(mobileOperatorsTable.slug, slug));
        operatorsUpdated++;
      } else {
        await db.insert(mobileOperatorsTable).values({
          slug, name: entry.name, color: entry.color, active: true, countryCodes,
        });
        operatorsCreated++;
      }
    }

    /* 8. Upsert payment_routes (deposit) */
    let routesCreated = 0;
    let routesUpdated = 0;
    const existingRoutes = await db.select().from(paymentRoutesTable)
      .where(eq(paymentRoutesTable.transactionType, "deposit"));
    const existingRouteMap = new Map(existingRoutes.map(r => [`${r.countryCode}:${r.operatorSlug}`, r]));

    for (const { countryCode, slug } of routePairs) {
      const key = `${countryCode}:${slug}`;
      const existing = existingRouteMap.get(key);

      try {
        if (existing) {
          await db.update(paymentRoutesTable)
            .set({ primaryGatewayId: gw.id, active: true, maintenanceMode: false })
            .where(eq(paymentRoutesTable.id, existing.id));
          routesUpdated++;
        } else {
          await db.insert(paymentRoutesTable).values({
            countryCode, operatorSlug: slug, transactionType: "deposit",
            primaryGatewayId: gw.id, active: true, maintenanceMode: false,
          });
          routesCreated++;
        }
      } catch (err) {
        errors.push(`Route ${countryCode}/${slug}: ${(err as Error).message}`);
      }
    }

    logger.info({ operatorsCreated, operatorsUpdated, routesCreated, routesUpdated, env }, "[PawaPay Sync] Sync complete");

    res.json({
      success: true,
      summary: {
        env, gateway: gw.name,
        countries: (config.countries ?? []).length,
        providers: routePairs.length,
        operatorsCreated, operatorsUpdated,
        routesCreated, routesUpdated,
        errors,
      },
    });
  } catch (err) {
    logger.error({ err }, "[PawaPay Sync] Error");
    res.status(500).json({ error: `Synchronisation échouée: ${(err as Error).message}` });
  }
});

/* ═══════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════ */

router.get("/admin/payment-routing/stats", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [totalGateways] = await db.select({ count: count() }).from(paymentGatewaysTable);
  const [activeGateways] = await db.select({ count: count() }).from(paymentGatewaysTable).where(eq(paymentGatewaysTable.active, true));
  const [totalOperators] = await db.select({ count: count() }).from(mobileOperatorsTable);
  const [totalRoutes] = await db.select({ count: count() }).from(paymentRoutesTable);
  const [activeRoutes] = await db.select({ count: count() }).from(paymentRoutesTable).where(eq(paymentRoutesTable.active, true));
  const [maintenanceRoutes] = await db.select({ count: count() }).from(paymentRoutesTable).where(eq(paymentRoutesTable.maintenanceMode, true));

  res.json({
    gateways: { total: Number(totalGateways.count), active: Number(activeGateways.count) },
    operators: { total: Number(totalOperators.count) },
    routes: { total: Number(totalRoutes.count), active: Number(activeRoutes.count), maintenance: Number(maintenanceRoutes.count) },
  });
});

/* ═══════════════════════════════════════════════════════════════
   PAYMENT GATEWAY STATS — real-time dashboard data
   ═══════════════════════════════════════════════════════════════ */
router.get("/admin/payment-routing/gateway-stats", requireAdminJwt, async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  /* ── 7-day logs breakdown by gateway + status + day ─────────── */
  const logsRaw = await db.execute(sql`
    SELECT
      metadata->>'gateway'  AS gateway,
      status,
      DATE(created_at AT TIME ZONE 'UTC') AS day,
      COUNT(*)::int                        AS attempts,
      ROUND(AVG(response_time_ms))::int    AS avg_latency_ms,
      SUM(CASE WHEN metadata->>'amountXof' IS NOT NULL
               THEN (metadata->>'amountXof')::numeric ELSE 0 END)::int AS total_xof
    FROM payment_route_logs
    WHERE event_type = 'payment'
      AND created_at >= ${sevenDaysAgo}
      AND metadata->>'gateway' IN ('clapay','pawapay')
    GROUP BY 1, 2, 3
    ORDER BY 3 DESC
  `);

  /* ── Pending deposits by gateway ─────────────────────────────── */
  const pendingRaw = await db.execute(sql`
    SELECT
      CASE WHEN external_deposit_id LIKE 'clapay:%' THEN 'clapay' ELSE 'pawapay' END AS gateway,
      COUNT(*)::int AS pending_count
    FROM transactions
    WHERE type = 'recharge' AND status = 'pending'
    GROUP BY 1
  `);

  /* ── Build structured response ────────────────────────────────── */
  type DayEntry = {
    day: string;
    success: number; error: number; timeout: number;
    avgLatencyMs: number; totalXof: number;
  };
  type GatewayData = {
    today: { success: number; error: number; timeout: number; avgLatencyMs: number; totalXof: number };
    pending: number;
    days: DayEntry[];
  };

  const gateways: Record<string, GatewayData> = {
    clapay:  { today: { success: 0, error: 0, timeout: 0, avgLatencyMs: 0, totalXof: 0 }, pending: 0, days: [] },
    pawapay: { today: { success: 0, error: 0, timeout: 0, avgLatencyMs: 0, totalXof: 0 }, pending: 0, days: [] },
  };

  /* Map logs into structure */
  const dayMap: Record<string, Record<string, DayEntry>> = { clapay: {}, pawapay: {} };
  for (const row of (logsRaw as { rows: Record<string, unknown>[] }).rows ?? (logsRaw as unknown as Record<string, unknown>[])) {
    const gw = String(row.gateway ?? "");
    if (!(gw in gateways)) continue;
    const day = String(row.day ?? "").slice(0, 10);
    const status = String(row.status ?? "");
    const attempts = Number(row.attempts ?? 0);
    const latency = Number(row.avg_latency_ms ?? 0);
    const xof = Number(row.total_xof ?? 0);

    if (!dayMap[gw][day]) dayMap[gw][day] = { day, success: 0, error: 0, timeout: 0, avgLatencyMs: 0, totalXof: 0 };
    if (status === "success") { dayMap[gw][day].success += attempts; dayMap[gw][day].totalXof += xof; }
    else if (status === "error") dayMap[gw][day].error += attempts;
    else if (status === "timeout") dayMap[gw][day].timeout += attempts;
    dayMap[gw][day].avgLatencyMs = Math.max(dayMap[gw][day].avgLatencyMs, latency);

    /* Today's aggregates */
    if (day === todayStart.toISOString().slice(0, 10)) {
      if (status === "success") { gateways[gw].today.success += attempts; gateways[gw].today.totalXof += xof; }
      else if (status === "error") gateways[gw].today.error += attempts;
      else if (status === "timeout") gateways[gw].today.timeout += attempts;
      gateways[gw].today.avgLatencyMs = Math.max(gateways[gw].today.avgLatencyMs, latency);
    }
  }

  /* Fill 7-day arrays */
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  for (const gw of ["clapay", "pawapay"]) {
    gateways[gw].days = dayLabels.map(d => dayMap[gw][d] ?? { day: d, success: 0, error: 0, timeout: 0, avgLatencyMs: 0, totalXof: 0 });
  }

  /* Pending counts */
  for (const row of (pendingRaw as { rows: Record<string, unknown>[] }).rows ?? (pendingRaw as unknown as Record<string, unknown>[])) {
    const gw = String(row.gateway ?? "");
    if (gw in gateways) gateways[gw].pending = Number(row.pending_count ?? 0);
  }

  res.json({ gateways, generatedAt: now.toISOString() });
});

export default router;
