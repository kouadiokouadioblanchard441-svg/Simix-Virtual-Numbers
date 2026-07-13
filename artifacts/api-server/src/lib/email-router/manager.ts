/**
 * EmailProviderManager — cœur du système multi-fournisseurs
 *
 * Responsabilités :
 *  - Charger les fournisseurs actifs depuis la DB (cache 60s)
 *  - Tenter l'envoi via failover automatique (priorité croissante)
 *  - Persister chaque email dans email_queue (déduplication)
 *  - Journaliser chaque tentative dans email_send_logs
 *  - Vérifier la santé des fournisseurs toutes les 5 min
 *  - Retraiter la file d'attente toutes les 2 min
 *  - Auto-seeder Resend depuis system_settings si aucun fournisseur configuré
 */
import { createHash } from "crypto";
import { eq, and, lte, lt, asc, sql } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";
import {
  emailProvidersTable,
  emailQueueTable,
  emailSendLogsTable,
} from "@workspace/db";
import { logger } from "../logger";
import { encrypt, decrypt } from "./crypto";
import {
  SEND_TIMEOUT_MS,
  CONSECUTIVE_ERROR_THRESHOLD,
  CONSECUTIVE_ERROR_DEGRADED,
  retryDelayMs,
  type EmailPayload,
  type SendResult,
  type ResolvedProvider,
  type ProviderStats,
} from "./types";
import type { ProviderAdapter } from "./types";

// ── Registre des adaptateurs ──────────────────────────────────────
import { resendAdapter }      from "./adapters/resend";
import { sesAdapter }         from "./adapters/ses";
import { postmarkAdapter }    from "./adapters/postmark";
import { mailgunAdapter }     from "./adapters/mailgun";
import { sendgridAdapter }    from "./adapters/sendgrid";
import { brevoAdapter }       from "./adapters/brevo";
import { mailjetAdapter }     from "./adapters/mailjet";
import { sparkpostAdapter }   from "./adapters/sparkpost";
import { zeptomailAdapter }   from "./adapters/zeptomail";
import { elasticemailAdapter } from "./adapters/elasticemail";

const ADAPTERS: Record<string, ProviderAdapter> = {
  resend:       resendAdapter,
  ses:          sesAdapter,
  postmark:     postmarkAdapter,
  mailgun:      mailgunAdapter,
  sendgrid:     sendgridAdapter,
  brevo:        brevoAdapter,
  mailjet:      mailjetAdapter,
  sparkpost:    sparkpostAdapter,
  zeptomail:    zeptomailAdapter,
  elasticemail: elasticemailAdapter,
};

export const SUPPORTED_PROVIDERS = [
  { slug: "resend",       name: "Resend",             requiresSecret: false, requiresDomain: false },
  { slug: "ses",          name: "Amazon SES",         requiresSecret: true,  requiresDomain: false },
  { slug: "postmark",     name: "Postmark",           requiresSecret: false, requiresDomain: false },
  { slug: "mailgun",      name: "Mailgun",            requiresSecret: false, requiresDomain: true  },
  { slug: "sendgrid",     name: "SendGrid",           requiresSecret: false, requiresDomain: false },
  { slug: "brevo",        name: "Brevo (Sendinblue)", requiresSecret: false, requiresDomain: false },
  { slug: "mailjet",      name: "Mailjet",            requiresSecret: true,  requiresDomain: false },
  { slug: "sparkpost",    name: "SparkPost",          requiresSecret: false, requiresDomain: false },
  { slug: "zeptomail",    name: "ZeptoMail",          requiresSecret: false, requiresDomain: false },
  { slug: "elasticemail", name: "Elastic Email",      requiresSecret: false, requiresDomain: false },
];

// ─────────────────────────────────────────────────────────────────
class EmailProviderManager {
  private cache:     ResolvedProvider[] = [];
  private cacheTs    = 0;
  private readonly CACHE_TTL = 60_000; // 1 min
  private retryTimer:  NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private seeding = false;

  // ── Charge (et met en cache) les fournisseurs actifs ─────────
  private async loadProviders(): Promise<ResolvedProvider[]> {
    if (Date.now() - this.cacheTs < this.CACHE_TTL) return this.cache;
    const rows = await db
      .select()
      .from(emailProvidersTable)
      .where(eq(emailProvidersTable.active, true))
      .orderBy(asc(emailProvidersTable.priority));

    this.cache = rows.map(r => ({
      id:               r.id,
      name:             r.name,
      slug:             r.slug,
      priority:         r.priority,
      active:           r.active,
      apiKey:           r.apiKeyEnc    ? decrypt(r.apiKeyEnc)    : null,
      apiSecret:        r.apiSecretEnc ? decrypt(r.apiSecretEnc) : null,
      domain:           r.domain,
      region:           r.region,
      config:           r.config as Record<string, string> | null,
      healthStatus:     r.healthStatus,
      consecutiveErrors: r.consecutiveErrors,
    }));
    this.cacheTs = Date.now();

    // Auto-seed Resend si aucun fournisseur configuré
    if (this.cache.length === 0 && !this.seeding) {
      await this.seedResendFromSettings();
    }
    return this.cache;
  }

  /** Invalide le cache (après modification d'un fournisseur) */
  invalidateCache(): void { this.cacheTs = 0; }

  // ── Seed automatique Resend depuis system_settings ────────────
  private async seedResendFromSettings(): Promise<void> {
    this.seeding = true;
    try {
      const rows = await db.select().from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "resend_api_key")).limit(1);
      const apiKey = rows[0]?.value?.trim();
      if (!apiKey) return;

      const existing = await db.select({ id: emailProvidersTable.id })
        .from(emailProvidersTable)
        .where(eq(emailProvidersTable.slug, "resend"))
        .limit(1);
      if (existing.length > 0) return;

      await db.insert(emailProvidersTable).values({
        name:      "Resend",
        slug:      "resend",
        priority:  1,
        active:    true,
        apiKeyEnc: encrypt(apiKey),
      });
      logger.info("[email-router] Resend auto-seeded depuis system_settings");
      this.cacheTs = 0;
    } catch (err) {
      logger.warn({ err }, "[email-router] Auto-seed Resend échoué");
    } finally {
      this.seeding = false;
    }
  }

  // ── Clé d'idempotence ─────────────────────────────────────────
  private makeIdempotencyKey(payload: EmailPayload): string {
    // Round à la minute — évite les doublons dans la même minute
    const ts = Math.floor(Date.now() / 60_000);
    return createHash("sha256")
      .update(`${payload.to}|${payload.subject}|${ts}`)
      .digest("hex")
      .slice(0, 32);
  }

  // ── Envoi principal avec failover ─────────────────────────────
  async send(payload: EmailPayload): Promise<SendResult> {
    const idempotencyKey = payload.idempotencyKey ?? this.makeIdempotencyKey(payload);

    // ── Déduplication ─────────────────────────────────────────
    const existing = await db.select()
      .from(emailQueueTable)
      .where(eq(emailQueueTable.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing[0]?.status === "sent") {
      return { success: true, cached: true, queueId: existing[0].id, provider: existing[0].providerId ?? undefined };
    }

    // ── Créer ou récupérer l'entrée en file ───────────────────
    let queueId: string;
    if (existing[0]) {
      queueId = existing[0].id;
    } else {
      const [row] = await db.insert(emailQueueTable).values({
        idempotencyKey,
        toEmail:    payload.to,
        fromEmail:  payload.from ?? "",
        subject:    payload.subject,
        html:       payload.html,
        textContent: payload.text,
        metadata:   payload.metadata,
        status:     "pending",
        maxAttempts: 5,
      }).returning({ id: emailQueueTable.id });
      queueId = row.id;
    }

    // ── Tentatives par ordre de priorité ──────────────────────
    const providers = await this.loadProviders();
    if (providers.length === 0) {
      logger.warn("[email-router] Aucun fournisseur actif configuré");
      await db.update(emailQueueTable)
        .set({ status: "failed", error: "Aucun fournisseur actif", attempts: 1, nextRetryAt: new Date(Date.now() + retryDelayMs(0)) })
        .where(eq(emailQueueTable.id, queueId));
      return { success: false, error: "Aucun fournisseur email actif" };
    }

    for (const provider of providers) {
      // Ne saute un fournisseur "down" que s'il existe une alternative moins dégradée —
      // sinon (cas mono-fournisseur), on retente quand même : rester bloqué "down" pour
      // toujours (aucun succès n'est possible pour se réhabiliter) créait une panne totale
      // et silencieuse tant que le health check périodique n'avait pas corrigé le statut.
      const hasBetterAlternative = providers.some(
        p => p.id !== provider.id && p.healthStatus !== "down",
      );
      if (provider.healthStatus === "down" && hasBetterAlternative) continue;
      const adapter = ADAPTERS[provider.slug];
      if (!adapter) continue;

      const start = Date.now();
      try {
        const result = await Promise.race([
          adapter.send(payload, {
            apiKey:    provider.apiKey   ?? undefined,
            apiSecret: provider.apiSecret ?? undefined,
            domain:    provider.domain   ?? undefined,
            region:    provider.region   ?? undefined,
            config:    provider.config   ?? undefined,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), SEND_TIMEOUT_MS)
          ),
        ]);

        const latencyMs = Date.now() - start;
        logger.info({ provider: provider.slug, to: payload.to, latencyMs }, "[email-router] Email envoyé ✓");

        // Marquer succès
        await Promise.all([
          db.insert(emailSendLogsTable).values({
            queueId, providerId: provider.id, status: "success",
            latencyMs, responseId: result.messageId,
          }),
          db.update(emailQueueTable).set({
            status: "sent", sentAt: new Date(),
            providerId: provider.id, attempts: (existing[0]?.attempts ?? 0) + 1,
          }).where(eq(emailQueueTable.id, queueId)),
          db.update(emailProvidersTable).set({
            totalSent:        sql`${emailProvidersTable.totalSent} + 1`,
            consecutiveErrors: 0,
            // Un envoi réussi prouve que le fournisseur fonctionne à nouveau —
            // le réhabiliter systématiquement (y compris depuis "down") évite
            // qu'il reste bloqué indéfiniment après une panne transitoire.
            healthStatus:     "healthy",
          }).where(eq(emailProvidersTable.id, provider.id)),
        ]);
        this.invalidateCache();
        return { success: true, provider: provider.slug, messageId: result.messageId, queueId };

      } catch (err) {
        const latencyMs = Date.now() - start;
        const errMsg    = err instanceof Error ? err.message : String(err);
        logger.warn({ provider: provider.slug, to: payload.to, err: errMsg, latencyMs }, "[email-router] Fournisseur échoué — tentative suivante");

        const newConsec = provider.consecutiveErrors + 1;
        const newHealth = newConsec >= CONSECUTIVE_ERROR_THRESHOLD ? "down"
          : newConsec >= CONSECUTIVE_ERROR_DEGRADED ? "degraded"
          : provider.healthStatus;

        await Promise.all([
          db.insert(emailSendLogsTable).values({
            queueId, providerId: provider.id, status: "failure",
            latencyMs, error: errMsg,
          }),
          db.update(emailProvidersTable).set({
            totalFailed:      sql`${emailProvidersTable.totalFailed} + 1`,
            consecutiveErrors: newConsec,
            healthStatus:     newHealth,
            lastError:        errMsg,
            lastErrorAt:      new Date(),
          }).where(eq(emailProvidersTable.id, provider.id)),
        ]);
        this.invalidateCache();
        // Continuer avec le prochain fournisseur
      }
    }

    // ── Tous les fournisseurs ont échoué — planifier retry ────
    const attempts = (existing[0]?.attempts ?? 0) + providers.length;
    await db.update(emailQueueTable).set({
      status:      attempts >= 5 ? "failed" : "pending",
      attempts,
      error:       "Tous les fournisseurs ont échoué",
      nextRetryAt: attempts >= 5 ? null : new Date(Date.now() + retryDelayMs(attempts)),
    }).where(eq(emailQueueTable.id, queueId));

    return { success: false, error: "Tous les fournisseurs ont échoué — email en file d'attente", queueId };
  }

  // ── Worker de retry (toutes les 2 min) ───────────────────────
  async processRetryQueue(): Promise<void> {
    try {
      const pending = await db.select()
        .from(emailQueueTable)
        .where(
          and(
            eq(emailQueueTable.status, "pending"),
            lte(emailQueueTable.nextRetryAt, new Date()),
            lt(emailQueueTable.attempts, emailQueueTable.maxAttempts),
          )
        )
        .limit(20);

      for (const item of pending) {
        logger.info({ id: item.id, attempts: item.attempts }, "[email-router] Retry email en file");
        await this.send({
          to:              item.toEmail,
          from:            item.fromEmail,
          subject:         item.subject,
          html:            item.html,
          text:            item.textContent ?? undefined,
          idempotencyKey:  item.idempotencyKey,
          metadata:        item.metadata as Record<string, unknown> | undefined,
        });
      }
    } catch (err) {
      logger.warn({ err }, "[email-router] Erreur worker retry");
    }
  }

  // ── Health check de tous les fournisseurs actifs ──────────────
  async runHealthChecks(): Promise<void> {
    try {
      const rows = await db.select().from(emailProvidersTable)
        .where(eq(emailProvidersTable.active, true));

      await Promise.allSettled(rows.map(async (row) => {
        const adapter = ADAPTERS[row.slug];
        if (!adapter) return;
        const config = {
          apiKey:    row.apiKeyEnc    ? decrypt(row.apiKeyEnc)    : undefined,
          apiSecret: row.apiSecretEnc ? decrypt(row.apiSecretEnc) : undefined,
          domain:    row.domain       ?? undefined,
          region:    row.region       ?? undefined,
          config:    (row.config as Record<string, string>) ?? undefined,
        };
        const result = await Promise.race([
          adapter.healthCheck(config),
          new Promise<{ healthy: false; latencyMs: number; detail: string }>((resolve) =>
            setTimeout(() => resolve({ healthy: false, latencyMs: SEND_TIMEOUT_MS, detail: "Health check timeout" }), SEND_TIMEOUT_MS)
          ),
        ]);
        const status = result.healthy ? "healthy"
          : row.consecutiveErrors >= CONSECUTIVE_ERROR_THRESHOLD ? "down"
          : "degraded";

        await db.update(emailProvidersTable).set({
          healthStatus:    status,
          lastHealthCheck: new Date(),
          ...(!result.healthy ? { lastError: result.detail ?? "Health check failed" } : {}),
        }).where(eq(emailProvidersTable.id, row.id));
      }));
      this.invalidateCache();
    } catch (err) {
      logger.warn({ err }, "[email-router] Erreur health check");
    }
  }

  // ── Démarrage des workers background ─────────────────────────
  startBackgroundWorkers(): void {
    if (this.retryTimer || this.healthTimer) return;

    // Retry toutes les 2 minutes
    this.retryTimer = setInterval(() => { void this.processRetryQueue(); }, 2 * 60_000);

    // Health check toutes les 5 minutes (premier check dans 30s)
    setTimeout(() => {
      void this.runHealthChecks();
      this.healthTimer = setInterval(() => { void this.runHealthChecks(); }, 5 * 60_000);
    }, 30_000);

    logger.info("[email-router] Workers background démarrés (retry:2min, health:5min)");
  }

  stopBackgroundWorkers(): void {
    if (this.retryTimer)  { clearInterval(this.retryTimer);  this.retryTimer  = null; }
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
  }

  // ── Statistiques ─────────────────────────────────────────────
  async getStats(): Promise<ProviderStats[]> {
    const rows = await db.select().from(emailProvidersTable)
      .orderBy(asc(emailProvidersTable.priority));
    return rows.map(r => ({
      id:             r.id,
      name:           r.name,
      slug:           r.slug,
      priority:       r.priority,
      active:         r.active,
      healthStatus:   r.healthStatus,
      lastHealthCheck: r.lastHealthCheck,
      totalSent:      r.totalSent,
      totalFailed:    r.totalFailed,
      successRate:    r.totalSent + r.totalFailed === 0 ? 100
        : Math.round((r.totalSent / (r.totalSent + r.totalFailed)) * 100),
      lastError:      r.lastError,
      lastErrorAt:    r.lastErrorAt,
    }));
  }
}

// Singleton
let _manager: EmailProviderManager | null = null;
export function getEmailManager(): EmailProviderManager {
  if (!_manager) _manager = new EmailProviderManager();
  return _manager;
}
