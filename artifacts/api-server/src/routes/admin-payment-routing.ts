/**
 * Admin Payment Routing — CRUD for gateways, operators, routes + routing engine
 * All routes: /api/admin/payment-routing/*
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, asc, count } from "drizzle-orm";
import {
  db,
  mobileOperatorsTable,
  paymentGatewaysTable,
  paymentRoutesTable,
  paymentRouteLogsTable,
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
  const { id } = req.params;
  const { name, slug, logoUrl, color, countryCodes, active, sortOrder } = req.body as Partial<{
    name: string; slug: string; logoUrl: string; color: string;
    countryCodes: string[]; active: boolean; sortOrder: number;
  }>;
  const [op] = await db.update(mobileOperatorsTable)
    .set({
      ...(name && { name: name.trim() }),
      ...(slug && { slug: slug.trim().toLowerCase() }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(color && { color }),
      ...(countryCodes !== undefined && { countryCodes }),
      ...(active !== undefined && { active }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(mobileOperatorsTable.id, id))
    .returning();
  if (!op) { res.status(404).json({ error: "Opérateur introuvable" }); return; }
  res.json(op);
});

router.delete("/admin/payment-routing/operators/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await db.delete(mobileOperatorsTable).where(eq(mobileOperatorsTable.id, req.params.id));
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
  const { id } = req.params;
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
  await db.delete(paymentGatewaysTable).where(eq(paymentGatewaysTable.id, req.params.id));
  logger.info({ id: req.params.id, adminId: adminId(req) }, "[payment-routing] Gateway deleted");
  res.json({ success: true });
});

/* ── Test gateway connectivity ─── */
router.post("/admin/payment-routing/gateways/:id/test", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [gw] = await db.select().from(paymentGatewaysTable).where(eq(paymentGatewaysTable.id, id)).limit(1);
  if (!gw) { res.status(404).json({ error: "Passerelle introuvable" }); return; }

  const slug = gw.slug.toLowerCase();
  const start = Date.now();

  /* ── PawaPay: use dedicated client test ── */
  if (slug === "pawapay" || slug.includes("pawapay")) {
    const token = gw.apiKey ?? process.env.PAWAPAY_API_TOKEN ?? null;
    if (!token) {
      res.json({ status: "no_token", message: "Aucun token PawaPay configuré. Ajoutez la clé API dans les paramètres de ce fournisseur." });
      return;
    }
    try {
      const { PawaPayClient } = await import("../lib/pawapay");
      const env = (process.env.PAWAPAY_ENV as "sandbox" | "production" | undefined) ?? "sandbox";
      const client = new PawaPayClient(token, env);
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
    const token = gw.apiKey ?? process.env.CLAPAY_API_TOKEN ?? null;
    if (!token) {
      res.json({ status: "no_token", message: "Aucun token Clapay configuré. Ajoutez la clé API dans les paramètres de ce fournisseur." });
      return;
    }
    try {
      const { ClapayClient } = await import("../lib/clapay");
      const baseUrl = gw.apiUrl ?? process.env.CLAPAY_BASE_URL ?? undefined;
      const client = new ClapayClient(token, baseUrl);
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

router.put("/admin/payment-routing/routes/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
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
  await db.delete(paymentRoutesTable).where(eq(paymentRoutesTable.id, req.params.id));
  res.json({ success: true });
});

/* ── Quick switch: change primary gateway for a route ─── */
router.post("/admin/payment-routing/routes/:id/switch", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
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
  const { id } = req.params;
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

export default router;
