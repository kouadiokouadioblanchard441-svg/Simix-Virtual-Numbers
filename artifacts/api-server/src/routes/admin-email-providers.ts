/**
 * Admin — Gestion multi-fournisseurs email
 *
 * GET    /admin/email-providers            — liste tous les fournisseurs
 * POST   /admin/email-providers            — créer un fournisseur
 * PUT    /admin/email-providers/:id        — modifier un fournisseur
 * DELETE /admin/email-providers/:id        — supprimer un fournisseur
 * POST   /admin/email-providers/:id/toggle — activer / désactiver
 * POST   /admin/email-providers/:id/test   — tester l'envoi
 * POST   /admin/email-providers/health-check — déclencher health check
 * GET    /admin/email-providers/stats      — statistiques globales
 * GET    /admin/email-providers/queue      — file d'attente
 * GET    /admin/email-providers/logs       — journaux d'envoi
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, and, gte, count, asc, lte, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailProvidersTable,
  emailQueueTable,
  emailSendLogsTable,
} from "@workspace/db";
import { requireAdminJwt } from "../lib/admin-jwt-middleware";
import { logger } from "../lib/logger";
import { encrypt, decrypt, maskApiKey } from "../lib/email-router/crypto";
import { SUPPORTED_PROVIDERS } from "../lib/email-router";
import { emailService } from "../lib/email-service";
import { getFromEmail } from "../lib/email-from";
import { seedEmailProvidersFromEnv } from "../lib/seed-providers";

const router: IRouter = Router();
router.use(requireAdminJwt);

/* ── Serialise un fournisseur sans exposer les clés ─────────── */
function safeProvider(r: typeof emailProvidersTable.$inferSelect) {
  const envApiKey = r.slug === "brevo"
    ? process.env["BREVO_API_KEY"]?.trim()
    : r.slug === "resend"
      ? process.env["RESEND_API_KEY"]?.trim()
      : undefined;
  const senderEmail = r.slug === "brevo"
    ? process.env["BREVO_SENDER_EMAIL"]?.trim() || null
    : r.slug === "resend"
      ? process.env["RESEND_SENDER_EMAIL"]?.trim() || null
      : null;
  const senderName = r.slug === "brevo"
    ? process.env["BREVO_SENDER_NAME"]?.trim() || null
    : r.slug === "resend"
      ? process.env["RESEND_SENDER_NAME"]?.trim() || null
      : null;
  let apiKeyMasked: string | null = null;
  if (r.apiKeyEnc) {
    try { apiKeyMasked = maskApiKey(decrypt(r.apiKeyEnc)); } catch { /* clé chiffrée avec une ancienne clé */ }
  }
  if (!apiKeyMasked && envApiKey) apiKeyMasked = maskApiKey(envApiKey);
  const role = r.slug === "brevo" ? "primary" : r.slug === "resend" ? "fallback" : null;
  return {
    id:               r.id,
    name:             r.name,
    slug:             r.slug,
    priority:         r.priority,
    active:           r.active,
    apiKeyMasked,
    apiKeySource:     r.apiKeyEnc ? "database" : envApiKey ? "environment" : "none",
    senderEmail,
    senderName,
    role,
    hasApiSecret:     !!r.apiSecretEnc,
    domain:           r.domain,
    region:           r.region,
    config:           r.config,
    healthStatus:     r.healthStatus,
    lastHealthCheck:  r.lastHealthCheck,
    consecutiveErrors: r.consecutiveErrors,
    totalSent:        r.totalSent,
    totalFailed:      r.totalFailed,
    successRate:      r.totalSent + r.totalFailed === 0 ? 100
      : Math.round((r.totalSent / (r.totalSent + r.totalFailed)) * 100),
    lastError:        r.lastError,
    lastErrorAt:      r.lastErrorAt,
    createdAt:        r.createdAt,
    updatedAt:        r.updatedAt,
  };
}

/* ── GET /admin/email-providers ─────────────────────────────── */
router.get("/admin/email-providers", async (_req: Request, res: Response): Promise<void> => {
  // Permet au panneau de faire apparaître/réparer automatiquement Brevo et
  // Resend dès que les variables Plesk sont présentes, sans exposer les clés.
  try { await seedEmailProvidersFromEnv(); }
  catch (err) { logger.warn({ err }, "[admin] Bootstrap email depuis environnement ignoré"); }
  const rows = await db.select().from(emailProvidersTable).orderBy(asc(emailProvidersTable.priority));
  rows.sort((a, b) => {
    const role = (slug: string) => slug === "brevo" ? 1 : slug === "resend" ? 2 : 100;
    return role(a.slug) - role(b.slug) || a.priority - b.priority;
  });
  res.json({ providers: rows.map(safeProvider), supported: SUPPORTED_PROVIDERS });
});

/* ── POST /admin/email-providers ────────────────────────────── */
router.post("/admin/email-providers", async (req: Request, res: Response): Promise<void> => {
  const { name, slug, priority, active, apiKey, apiSecret, domain, region, config } = req.body as {
    name: string; slug: string; priority?: number; active?: boolean;
    apiKey?: string; apiSecret?: string; domain?: string; region?: string;
    config?: Record<string, string>;
  };
  if (!name || !slug) { res.status(400).json({ error: "name et slug sont requis" }); return; }
  if (active && !apiKey?.trim()) {
    res.status(400).json({ error: "Une clé API est requise pour activer ce fournisseur" });
    return;
  }

  const [row] = await db.insert(emailProvidersTable).values({
    name, slug,
    priority:    priority  ?? 100,
    active:      active    ?? false,
    apiKeyEnc:   apiKey    ? encrypt(apiKey)    : null,
    apiSecretEnc: apiSecret ? encrypt(apiSecret) : null,
    domain:      domain    ?? null,
    region:      region    ?? null,
    config:      config    ?? null,
  }).returning();

  emailService.invalidateCache();
  logger.info({ slug, name }, "[admin] Fournisseur email créé");
  res.status(201).json({ provider: safeProvider(row) });
});

/* ── PUT /admin/email-providers/:id ─────────────────────────── */
router.put("/admin/email-providers/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, slug, priority, active, apiKey, apiSecret, domain, region, config } = req.body as {
    name?: string; slug?: string; priority?: number; active?: boolean;
    apiKey?: string; apiSecret?: string; domain?: string; region?: string;
    config?: Record<string, string>;
  };

  const updates: Partial<typeof emailProvidersTable.$inferInsert> = {};
  const [current] = await db.select({
    active: emailProvidersTable.active,
    apiKeyEnc: emailProvidersTable.apiKeyEnc,
  }).from(emailProvidersTable).where(eq(emailProvidersTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  const resultingHasApiKey = apiKey === undefined ? !!current.apiKeyEnc : !!apiKey.trim();
  const resultingActive = active === undefined ? current.active : active;
  if (resultingActive && !resultingHasApiKey) {
    res.status(400).json({ error: "Une clé API est requise pour activer ce fournisseur" });
    return;
  }
  if (name     !== undefined) updates.name      = name;
  if (slug     !== undefined) updates.slug      = slug;
  if (priority !== undefined) updates.priority  = priority;
  if (active   !== undefined) updates.active    = active;
  if (apiKey   !== undefined) updates.apiKeyEnc = apiKey ? encrypt(apiKey) : null;
  if (apiSecret !== undefined) updates.apiSecretEnc = apiSecret ? encrypt(apiSecret) : null;
  if (domain   !== undefined) updates.domain    = domain;
  if (region   !== undefined) updates.region    = region;
  if (config   !== undefined) updates.config    = config;

  const [row] = await db.update(emailProvidersTable).set(updates)
    .where(eq(emailProvidersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  emailService.invalidateCache();
  logger.info({ id, slug: row.slug }, "[admin] Fournisseur email modifié");
  res.json({ provider: safeProvider(row) });
});

/* ── DELETE /admin/email-providers/:id ──────────────────────── */
router.delete("/admin/email-providers/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  await db.delete(emailProvidersTable).where(eq(emailProvidersTable.id, id));
  emailService.invalidateCache();
  logger.info({ id }, "[admin] Fournisseur email supprimé");
  res.json({ success: true });
});

/* ── POST /admin/email-providers/:id/toggle ─────────────────── */
router.post("/admin/email-providers/:id/toggle", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const [current] = await db.select({
    active: emailProvidersTable.active,
    apiKeyEnc: emailProvidersTable.apiKeyEnc,
  })
    .from(emailProvidersTable).where(eq(emailProvidersTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }
  if (!current.active && !current.apiKeyEnc) {
    res.status(400).json({ error: "Ajoutez une clé API avant d'activer ce fournisseur" });
    return;
  }

  const [row] = await db.update(emailProvidersTable)
    .set({ active: !current.active })
    .where(eq(emailProvidersTable.id, id)).returning();

  emailService.invalidateCache();
  res.json({ provider: safeProvider(row) });
});

/* ── POST /admin/email-providers/:id/test ───────────────────── */
router.post("/admin/email-providers/:id/test", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: "email requis" }); return; }

  const [row] = await db.select().from(emailProvidersTable)
    .where(eq(emailProvidersTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Fournisseur introuvable" }); return; }

  const from = await getFromEmail();
  const start = Date.now();
  try {
    const result = await emailService.testProvider(
      id,
      {
        to: email, from,
        subject: `🧪 Test ${row.name} — Simix Admin`,
        html: buildTestEmailHtml(row.name, email),
        idempotencyKey: `test-${id}-${Date.now()}`,
      }
    );
    const latencyMs = Date.now() - start;
    logger.info({ slug: row.slug, email, latencyMs }, "[admin] Test email envoyé ✓");
    res.json({ success: true, messageId: result.messageId, latencyMs, provider: row.slug });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ slug: row.slug, email, err: msg }, "[admin] Test email échoué");
    res.status(500).json({ success: false, error: msg, latencyMs, provider: row.slug });
  }
});

/* ── POST /admin/email-providers/health-check ───────────────── */
router.post("/admin/email-providers/health-check", async (_req: Request, res: Response): Promise<void> => {
  await emailService.runHealthChecks();
  res.json({ success: true, message: "Health check terminé" });
});

/* ── POST /admin/email-providers/retry-pending ─────────────── */
router.post("/admin/email-providers/retry-pending", async (_req: Request, res: Response): Promise<void> => {
  const [configuredProvider] = await db.select({ id: emailProvidersTable.id })
    .from(emailProvidersTable)
    .where(and(
      eq(emailProvidersTable.active, true),
      isNotNull(emailProvidersTable.apiKeyEnc),
    ))
    .limit(1);

  if (!configuredProvider) {
    res.status(409).json({ error: "Aucun fournisseur email actif avec une clé API configurée" });
    return;
  }

  const [{ before }] = await db.select({ before: count() })
    .from(emailQueueTable)
    .where(and(
      eq(emailQueueTable.status, "pending"),
      lte(emailQueueTable.nextRetryAt, new Date()),
    ));

  await emailService.processRetryQueue();

  const [{ after }] = await db.select({ after: count() })
    .from(emailQueueTable)
    .where(and(
      eq(emailQueueTable.status, "pending"),
      lte(emailQueueTable.nextRetryAt, new Date()),
    ));

  res.json({
    success: true,
    processed: Math.max(0, Number(before) - Number(after)),
    dueBefore: Number(before),
    dueAfter: Number(after),
    message: Number(after) > 0
      ? "Un lot a été traité. Relancez l'action pour traiter le lot suivant."
      : "Tous les emails actuellement éligibles ont été traités.",
  });
});

/* ── GET /admin/email-providers/stats ──────────────────────── */
router.get("/admin/email-providers/stats", async (_req: Request, res: Response): Promise<void> => {
  const [totalSent]    = await db.select({ c: count() }).from(emailQueueTable).where(eq(emailQueueTable.status, "sent"));
  const [totalPending] = await db.select({ c: count() }).from(emailQueueTable).where(eq(emailQueueTable.status, "pending"));
  const [totalFailed]  = await db.select({ c: count() }).from(emailQueueTable).where(eq(emailQueueTable.status, "failed"));
  const [totalLogs]    = await db.select({ c: count() }).from(emailSendLogsTable);
  const providerStats  = await emailService.getStats();

  res.json({
    queue: {
      sent:    Number(totalSent.c),
      pending: Number(totalPending.c),
      failed:  Number(totalFailed.c),
    },
    totalAttempts: Number(totalLogs.c),
    providers:     providerStats,
  });
});

/* ── GET /admin/email-providers/queue ──────────────────────── */
router.get("/admin/email-providers/queue", async (req: Request, res: Response): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
  const status = req.query.status as string | undefined;

  const rows = await db.select({
    id:              emailQueueTable.id,
    toEmail:         emailQueueTable.toEmail,
    subject:         emailQueueTable.subject,
    status:          emailQueueTable.status,
    attempts:        emailQueueTable.attempts,
    maxAttempts:     emailQueueTable.maxAttempts,
    nextRetryAt:     emailQueueTable.nextRetryAt,
    sentAt:          emailQueueTable.sentAt,
    error:           emailQueueTable.error,
    createdAt:       emailQueueTable.createdAt,
  }).from(emailQueueTable)
    .where(status ? eq(emailQueueTable.status, status) : undefined)
    .orderBy(desc(emailQueueTable.createdAt))
    .limit(limit);

  res.json({ queue: rows, total: rows.length });
});

/* ── GET /admin/email-providers/logs ───────────────────────── */
router.get("/admin/email-providers/logs", async (req: Request, res: Response): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit ?? 100), 500);
  const since  = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 24 * 3600_000);

  const rows = await db.select({
    id:          emailSendLogsTable.id,
    queueId:     emailSendLogsTable.queueId,
    providerId:  emailSendLogsTable.providerId,
    attemptedAt: emailSendLogsTable.attemptedAt,
    status:      emailSendLogsTable.status,
    latencyMs:   emailSendLogsTable.latencyMs,
    responseId:  emailSendLogsTable.responseId,
    error:       emailSendLogsTable.error,
    providerName: emailProvidersTable.name,
    providerSlug: emailProvidersTable.slug,
    toEmail:     emailQueueTable.toEmail,
    subject:     emailQueueTable.subject,
  }).from(emailSendLogsTable)
    .leftJoin(emailProvidersTable, eq(emailSendLogsTable.providerId, emailProvidersTable.id))
    .leftJoin(emailQueueTable,     eq(emailSendLogsTable.queueId, emailQueueTable.id))
    .where(gte(emailSendLogsTable.attemptedAt, since))
    .orderBy(desc(emailSendLogsTable.attemptedAt))
    .limit(limit);

  res.json({ logs: rows, total: rows.length });
});

/* ── Helper HTML de test ────────────────────────────────────── */
function buildTestEmailHtml(providerName: string, email: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:520px;">
<tr><td align="center" style="padding:0 0 24px;">
  <div style="width:48px;height:48px;background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;">
    <span style="color:white;font-size:24px;font-weight:800;">S</span></div>
  <span style="display:block;color:#e2e8f0;font-size:18px;font-weight:700;margin-top:8px;">Simix</span>
</td></tr>
<tr><td style="background:#16161f;border-radius:16px;border:1px solid #2a2a3d;padding:32px;">
  <p style="color:#a78bfa;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">TEST EMAIL PROVIDER</p>
  <h1 style="color:#e2e8f0;font-size:22px;font-weight:700;margin:0 0 16px;">✅ ${providerName} opérationnel</h1>
  <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 24px;">
    Ce test confirme que le fournisseur <strong style="color:#e2e8f0;">${providerName}</strong> est correctement configuré sur Simix.
  </p>
  <div style="background:#1e1e2e;border:1px solid #a78bfa33;border-radius:10px;padding:16px 20px;">
    <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Destinataire de test</p>
    <p style="color:#a78bfa;font-size:14px;font-weight:600;margin:0;">${email}</p>
  </div>
</td></tr>
<tr><td align="center" style="padding:20px 0 0;">
  <p style="color:#334155;font-size:11px;margin:0;">Simix — Panel Admin · Test de configuration email</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

export default router;
