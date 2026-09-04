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
import { eq, and, lte, lt, asc, sql, or } from "drizzle-orm";
import { db, systemSettingsTable, emailCampaignsTable, emailLogsTable } from "@workspace/db";
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
  ProviderSendError,
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

const QUOTA_RETRY_DELAY_MS = 15 * 60_000;
function getProviderSender(
  slug: string,
  config?: Record<string, string> | null,
): { email: string | null; name: string | null } {
  const configuredEmail = config?.senderEmail?.trim() || null;
  const configuredName = config?.senderName?.trim() || null;
  if (slug === "brevo") {
    return {
      email: configuredEmail ?? process.env["BREVO_SENDER_EMAIL"]?.trim() ?? null,
      name: configuredName ?? process.env["BREVO_SENDER_NAME"]?.trim() ?? null,
    };
  }
  if (slug === "resend") {
    return {
      email: configuredEmail ?? process.env["RESEND_SENDER_EMAIL"]?.trim() ?? null,
      name: configuredName ?? process.env["RESEND_SENDER_NAME"]?.trim() ?? null,
    };
  }
  return { email: null, name: null };
}

function payloadForProvider(payload: EmailPayload, provider: ResolvedProvider): EmailPayload {
  if (!provider.senderEmail) return payload;
  const from = provider.senderName
    ? `${provider.senderName.replace(/[<>]/g, "").trim()} <${provider.senderEmail}>`
    : provider.senderEmail;
  return { ...payload, from };
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return [
    "429",
    "quota",
    "rate limit",
    "rate-limit",
    "too many request",
    "daily limit",
    "monthly limit",
    "sending limit",
    "limit exceeded",
    "exceeded your",
    "insufficient credit",
    "insufficient balance",
    "throttl",
  ].some(marker => message.includes(marker));
}

function canWaitIndefinitelyForQuota(payload: EmailPayload): boolean {
  const type = payload.metadata?.["type"];
  return type !== "otp" && type !== "password_reset";
}

export async function refreshCampaignProgress(campaignId: string): Promise<void> {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) filter (where ${emailLogsTable.status} = 'sent')::int`,
      pending: sql<number>`count(*) filter (where ${emailLogsTable.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${emailLogsTable.status} = 'failed')::int`,
    })
    .from(emailLogsTable)
    .where(eq(emailLogsTable.campaignId, campaignId));

  const total = Number(stats?.total ?? 0);
  const sent = Number(stats?.sent ?? 0);
  const pending = Number(stats?.pending ?? 0);
  const failed = Number(stats?.failed ?? 0);
  if (total === 0) return;

  await db
    .update(emailCampaignsTable)
    .set({
      status: pending > 0 ? "pending" : sent === 0 && failed > 0 ? "failed" : "sent",
      sentCount: sent,
      failedCount: failed,
      sentAt: pending === 0 ? new Date() : null,
    })
    .where(eq(emailCampaignsTable.id, campaignId));
}

async function updateCampaignRecipient(
  payload: EmailPayload,
  status: "sent" | "failed",
  details?: { messageId?: string; error?: string },
): Promise<void> {
  const campaignId = payload.metadata?.["campaignId"];
  if (payload.metadata?.["type"] !== "admin_campaign" || typeof campaignId !== "string") return;

  await db
    .update(emailLogsTable)
    .set({
      status,
      messageId: details?.messageId ?? null,
      error: details?.error?.slice(0, 500) ?? null,
      sentAt: status === "sent" ? new Date() : null,
    })
    .where(and(
      eq(emailLogsTable.campaignId, campaignId),
      eq(emailLogsTable.email, payload.to),
      eq(emailLogsTable.status, "pending"),
    ));

  await refreshCampaignProgress(campaignId);
}

export const SUPPORTED_PROVIDERS = [
  { slug: "resend",       name: "Resend",             requiresSecret: false, requiresDomain: false },
  { slug: "brevo",        name: "Brevo (Sendinblue)", requiresSecret: false, requiresDomain: false },
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

    this.cache = rows.map(r => {
      const sender = getProviderSender(r.slug, r.config as Record<string, string> | null);
      return {
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
      senderEmail:      sender.email,
      senderName:       sender.name,
      healthStatus:     r.healthStatus,
      consecutiveErrors: r.consecutiveErrors,
      };
    }).sort((a, b) => a.priority - b.priority);
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
  async send(payload: EmailPayload, options: { alreadyClaimed?: boolean } = {}): Promise<SendResult> {
    const idempotencyKey = payload.idempotencyKey ?? this.makeIdempotencyKey(payload);

    // ── Déduplication ─────────────────────────────────────────
    const existing = await db.select()
      .from(emailQueueTable)
      .where(eq(emailQueueTable.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing[0]?.status === "sent") {
      await updateCampaignRecipient(payload, "sent");
      return { success: true, cached: true, queueId: existing[0].id, provider: existing[0].providerId ?? undefined };
    }
    if (existing[0] && ["failed", "cancelled"].includes(existing[0].status)) {
      return {
        success: false,
        cached: true,
        queueId: existing[0].id,
        error: existing[0].error ?? "Cet envoi a déjà échoué définitivement",
      };
    }

    // ── Créer ou récupérer l'entrée en file ───────────────────
    let queueId: string;
    if (existing[0]) {
      queueId = existing[0].id;
      if (!options.alreadyClaimed) {
        const claimed = await db.update(emailQueueTable)
          .set({ status: "processing" })
          .where(and(
            eq(emailQueueTable.id, queueId),
            eq(emailQueueTable.status, "pending"),
          ))
          .returning({ id: emailQueueTable.id });
        if (claimed.length === 0) {
          return {
            success: false,
            cached: true,
            queued: true,
            queueId,
            error: "Email déjà en cours de traitement",
          };
        }
      }
    } else {
      const inserted = await db.insert(emailQueueTable).values({
        idempotencyKey,
        toEmail:    payload.to,
        fromEmail:  payload.from ?? "",
        subject:    payload.subject,
        html:       payload.html,
        textContent: payload.text,
        metadata:   payload.metadata,
        status:     "processing",
        maxAttempts: 5,
        retryable:  false,
      }).onConflictDoNothing({ target: emailQueueTable.idempotencyKey })
        .returning({ id: emailQueueTable.id });
      if (inserted.length === 0) {
        const [concurrent] = await db.select()
          .from(emailQueueTable)
          .where(eq(emailQueueTable.idempotencyKey, idempotencyKey))
          .limit(1);
        return {
          success: concurrent?.status === "sent",
          cached: true,
          queued: concurrent?.status !== "sent",
          queueId: concurrent?.id,
          error: concurrent?.status === "sent" ? undefined : "Email déjà pris en charge",
        };
      }
      queueId = inserted[0].id;
    }

    // ── Tentatives par ordre de priorité ──────────────────────
    const activeProviders = await this.loadProviders();
    // Un providerId sur un élément non envoyé signifie qu'un résultat antérieur
    // était ambigu. Le retry commence par ce fournisseur pour
    // éviter qu'un message potentiellement accepté parte aussi via le secours.
    const ambiguousProviderId = existing[0]?.providerId ?? null;
    const pinnedProvider = ambiguousProviderId
      ? activeProviders.find(provider => provider.id === ambiguousProviderId) ?? null
      : null;
    // Après un timeout, le fournisseur concerné est essayé en premier. S'il
    // confirme ensuite le refus (temporary/definitive), le secours redevient
    // disponible. Cela évite de bloquer la file indéfiniment tout en
    // interdisant le fallback pendant que le résultat reste ambigu.
    const providers = pinnedProvider
      ? [pinnedProvider, ...activeProviders.filter(provider => provider.id !== pinnedProvider.id)]
      : ambiguousProviderId
        ? []
        : activeProviders;
    if (providers.length === 0) {
      logger.warn(
        { ambiguousProviderId: ambiguousProviderId ?? undefined },
        ambiguousProviderId
          ? "[email-router] Fournisseur du résultat ambigu indisponible — aucun fallback croisé"
          : "[email-router] Aucun fournisseur actif configuré",
      );
      const retryable = canWaitIndefinitelyForQuota(payload);
      const attempts = (existing[0]?.attempts ?? 0) + 1;
      const remainsPending = retryable || attempts < 5;
      await db.update(emailQueueTable)
        .set({
          status: remainsPending ? "pending" : "failed",
          retryable,
          error: "Aucun fournisseur actif",
          attempts,
          nextRetryAt: remainsPending ? new Date(Date.now() + QUOTA_RETRY_DELAY_MS) : null,
        })
        .where(eq(emailQueueTable.id, queueId));
      return {
        success: false,
        queued: remainsPending,
        retryable,
        queueId,
        error: remainsPending
          ? "Aucun fournisseur email actif — email conservé en attente"
          : "Aucun fournisseur email actif",
      };
    }

    let quotaOrRateLimitDetected = false;
    let temporaryFailureDetected = false;
    let ambiguousFailureDetected = false;
    let ambiguousFailureProviderId: string | null = null;
    let definitiveFailureDetected = false;
    let lastError = "";
    let attemptedProviders = 0;
    for (const [providerIndex, provider] of providers.entries()) {
      // Ne saute un fournisseur "down" que s'il existe une alternative moins dégradée —
      // sinon (cas mono-fournisseur), on retente quand même : rester bloqué "down" pour
      // toujours (aucun succès n'est possible pour se réhabiliter) créait une panne totale
      // et silencieuse tant que le health check périodique n'avait pas corrigé le statut.
      const hasBetterAlternative = providers.some(
        p => p.id !== provider.id && p.healthStatus !== "down",
      );
      // Un fournisseur épinglé après un timeout doit être réessayé, même si
      // son health check l'a marqué down : l'API peut avoir accepté l'envoi
      // précédent et est la seule qui puisse dédupliquer la même clé.
      if (provider.healthStatus === "down" && hasBetterAlternative && !(pinnedProvider && providerIndex === 0)) continue;
      const adapter = ADAPTERS[provider.slug];
      if (!adapter) continue;

      const start = Date.now();
      try {
        attemptedProviders += 1;
        const providerPayload = payloadForProvider({ ...payload, idempotencyKey }, provider);
        const result = await Promise.race([
          adapter.send(providerPayload, {
            apiKey:    provider.apiKey   ?? undefined,
            apiSecret: provider.apiSecret ?? undefined,
            domain:    provider.domain   ?? undefined,
            region:    provider.region   ?? undefined,
            config:    provider.config   ?? undefined,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new ProviderSendError(
              `${provider.name}: délai de réponse dépassé`,
              { kind: "ambiguous", code: "RESPONSE_TIMEOUT" },
            )), SEND_TIMEOUT_MS)
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
            providerId: provider.id,
            attempts: (existing[0]?.attempts ?? 0) + 1,
            retryable: false,
            nextRetryAt: null,
            error: null,
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
        await updateCampaignRecipient(payload, "sent", { messageId: result.messageId });
        this.invalidateCache();
        return { success: true, provider: provider.slug, messageId: result.messageId, queueId };

      } catch (err) {
        const latencyMs = Date.now() - start;
        const errMsg    = err instanceof Error ? err.message : String(err);
        lastError = errMsg;
        const failureKind = err instanceof ProviderSendError ? err.kind : "ambiguous";
        const quotaOrRateLimit = isQuotaOrRateLimitError(err);
        quotaOrRateLimitDetected ||= quotaOrRateLimit;
        temporaryFailureDetected ||= failureKind === "temporary";
        ambiguousFailureDetected ||= failureKind === "ambiguous";
        if (failureKind === "ambiguous") ambiguousFailureProviderId = provider.id;
        definitiveFailureDetected ||= failureKind === "definitive";
        logger.warn(
          { provider: provider.slug, to: payload.to, err: errMsg, latencyMs, failureKind },
          failureKind === "ambiguous"
            ? "[email-router] Résultat ambigu — pas de fallback pour éviter un doublon"
            : "[email-router] Échec — tentative du fournisseur de secours",
        );

        const newConsec = quotaOrRateLimit ? provider.consecutiveErrors : provider.consecutiveErrors + 1;
        const newHealth = quotaOrRateLimit
          ? provider.healthStatus
          : newConsec >= CONSECUTIVE_ERROR_THRESHOLD ? "down"
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
        // Une erreur temporaire ou définitive prouve que ce fournisseur n'a
        // pas accepté l'envoi : essayer le suivant. Une réponse ambiguë
        // (timeout après émission possible) reste verrouillée sur ce même
        // fournisseur avec la même clé d'idempotence pour éviter un doublon.
        if (failureKind === "ambiguous") break;
      }
    }

    // ── Tous les fournisseurs ont échoué — planifier retry ────
    const attempts = (existing[0]?.attempts ?? 0) + attemptedProviders;
    const retryable = quotaOrRateLimitDetected && canWaitIndefinitelyForQuota(payload);
    const remainsPending = !definitiveFailureDetected && (retryable || attempts < 5);
    const queueError = ambiguousFailureDetected
      ? "Résultat fournisseur incertain — nouvelle tentative idempotente programmée sans fallback immédiat"
      : definitiveFailureDetected
        ? lastError || "Email refusé définitivement"
        : quotaOrRateLimitDetected
      ? retryable
        ? "Quota ou limite d'envoi atteint — nouvelle tentative automatique programmée"
        : "Quota ou limite d'envoi atteint pour un email à durée de validité limitée"
      : temporaryFailureDetected ? "Tous les fournisseurs disponibles ont échoué temporairement" : "Tous les fournisseurs ont échoué";
    await db.update(emailQueueTable).set({
      status:      remainsPending ? "pending" : "failed",
      // L'affinité ne reste persistante que si la dernière tentative est
      // ambiguë. Un refus confirmé autorise le prochain retry à repartir
      // selon l'ordre normal des fournisseurs.
      providerId:  ambiguousFailureProviderId,
      attempts,
      retryable,
      error:       queueError,
      nextRetryAt: remainsPending
        ? new Date(Date.now() + (quotaOrRateLimitDetected ? QUOTA_RETRY_DELAY_MS : retryDelayMs(attempts)))
        : null,
    }).where(eq(emailQueueTable.id, queueId));

    if (!remainsPending) {
      await updateCampaignRecipient(payload, "failed", { error: queueError });
    }

    return {
      success: false,
      queued: remainsPending,
      retryable,
      error: remainsPending
        ? "Email conservé en file d'attente pour une nouvelle tentative automatique"
        : queueError,
      queueId,
    };
  }

  async testProvider(providerId: string, payload: EmailPayload): Promise<AdapterSendResult> {
    const [row] = await db.select().from(emailProvidersTable)
      .where(eq(emailProvidersTable.id, providerId)).limit(1);
    if (!row) throw new Error("Fournisseur introuvable");
    const adapter = ADAPTERS[row.slug];
    if (!adapter) throw new Error(`Adaptateur "${row.slug}" introuvable`);
    const sender = getProviderSender(row.slug, row.config as Record<string, string> | null);
    const resolved: ResolvedProvider = {
      id: row.id, name: row.name, slug: row.slug, priority: row.priority, active: row.active,
      apiKey: row.apiKeyEnc ? decrypt(row.apiKeyEnc) : null,
      apiSecret: row.apiSecretEnc ? decrypt(row.apiSecretEnc) : null,
      domain: row.domain, region: row.region,
      config: row.config as Record<string, string> | null,
      senderEmail: sender.email, senderName: sender.name,
      healthStatus: row.healthStatus, consecutiveErrors: row.consecutiveErrors,
    };
    return adapter.send(payloadForProvider(payload, resolved), {
      apiKey: resolved.apiKey ?? undefined,
      apiSecret: resolved.apiSecret ?? undefined,
      domain: resolved.domain ?? undefined,
      region: resolved.region ?? undefined,
      config: resolved.config ?? undefined,
    });
  }

  // ── Worker de retry (toutes les 2 min) ───────────────────────
  async processRetryQueue(): Promise<void> {
    try {
      // Réhabiliter les lignes réservées par un ancien processus interrompu.
      await db.update(emailQueueTable)
        .set({ status: "pending", nextRetryAt: new Date() })
        .where(and(
          eq(emailQueueTable.status, "processing"),
          lt(emailQueueTable.updatedAt, new Date(Date.now() - 10 * 60_000)),
        ));

      const pending = await db.select()
        .from(emailQueueTable)
        .where(
          and(
            eq(emailQueueTable.status, "pending"),
            lte(emailQueueTable.nextRetryAt, new Date()),
            or(
              eq(emailQueueTable.retryable, true),
              lt(emailQueueTable.attempts, emailQueueTable.maxAttempts),
            ),
          )
        )
        .limit(20);

      for (const item of pending) {
        const claimed = await db.update(emailQueueTable)
          .set({ status: "processing" })
          .where(and(
            eq(emailQueueTable.id, item.id),
            eq(emailQueueTable.status, "pending"),
          ))
          .returning({ id: emailQueueTable.id });
        if (claimed.length === 0) continue;

        logger.info({ id: item.id, attempts: item.attempts }, "[email-router] Retry email en file");
        try {
          await this.send({
            to:              item.toEmail,
            from:            item.fromEmail,
            subject:         item.subject,
            html:            item.html,
            text:            item.textContent ?? undefined,
            idempotencyKey:  item.idempotencyKey,
            metadata:        item.metadata as Record<string, unknown> | undefined,
          }, { alreadyClaimed: true });
        } catch (err) {
          logger.warn({ err, id: item.id }, "[email-router] Retry interrompu — remise en attente");
          await db.update(emailQueueTable)
            .set({
              status: "pending",
              error: err instanceof Error ? err.message : String(err),
              nextRetryAt: new Date(Date.now() + retryDelayMs(item.attempts)),
            })
            .where(and(
              eq(emailQueueTable.id, item.id),
              eq(emailQueueTable.status, "processing"),
            ));
        }
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

    // Premier traitement immédiat, puis retry toutes les 2 minutes
    void this.processRetryQueue();
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
    const allowedSlugs = new Set(SUPPORTED_PROVIDERS.map(provider => provider.slug));
    return rows.filter(r => allowedSlugs.has(r.slug)).map(r => ({
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
