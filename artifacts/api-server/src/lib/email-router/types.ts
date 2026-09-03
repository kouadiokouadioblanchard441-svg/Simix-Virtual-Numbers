/* ─────────────────────────────────────────────────────────────────
   Types partagés du système multi-fournisseurs email
───────────────────────────────────────────────────────────────── */

export interface EmailPayload {
  to: string;
  from?: string;          // optionnel — utilise le from par défaut si absent
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string; // clé de déduplication fournie par l'appelant
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  provider?: string;       // slug du fournisseur utilisé
  messageId?: string;
  cached?: boolean;        // true si déjà envoyé (idempotence)
  queueId?: string;
  queued?: boolean;        // true si conservé en attente pour une nouvelle tentative
  retryable?: boolean;     // true si quota/rate-limit ou fournisseur momentanément indisponible
  error?: string;
}

export interface AdapterConfig {
  apiKey?:    string;
  apiSecret?: string;      // Mailjet, SES
  domain?:    string;      // Mailgun
  region?:    string;      // SES
  config?:    Record<string, string>; // extra
}

export interface AdapterSendResult {
  messageId: string;
}

export type ProviderFailureKind = "temporary" | "definitive" | "ambiguous";

/**
 * Erreur normalisée d'un fournisseur.
 * - temporary: aucun envoi accepté, le fallback est sûr
 * - definitive: destinataire/contenu invalide, ne pas retenter ailleurs
 * - ambiguous: la requête a pu être acceptée; ne jamais basculer immédiatement
 */
export class ProviderSendError extends Error {
  readonly kind: ProviderFailureKind;
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { kind: ProviderFailureKind; status?: number; code?: string; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderSendError";
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
  }
}

export interface HealthCheckResult {
  healthy:   boolean;
  latencyMs: number;
  detail?:   string;
}

/** Interface que chaque adaptateur doit implémenter */
export interface ProviderAdapter {
  readonly slug: string;
  readonly name: string;
  send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult>;
  healthCheck(config: AdapterConfig): Promise<HealthCheckResult>;
}

/** Ligne de la table email_providers enrichie avec la clé déchiffrée (usage interne uniquement) */
export interface ResolvedProvider {
  id:           string;
  name:         string;
  slug:         string;
  priority:     number;
  active:       boolean;
  apiKey:       string | null;
  apiSecret:    string | null;
  domain:       string | null;
  region:       string | null;
  config:       Record<string, string> | null;
  senderEmail:  string | null;
  senderName:   string | null;
  healthStatus: string;
  consecutiveErrors: number;
}

export interface ProviderStats {
  id:           string;
  name:         string;
  slug:         string;
  priority:     number;
  active:       boolean;
  healthStatus: string;
  lastHealthCheck: Date | null;
  totalSent:    number;
  totalFailed:  number;
  successRate:  number;
  lastError:    string | null;
  lastErrorAt:  Date | null;
}

/** Délai de retry exponentiel (ms) pour tentative N */
export function retryDelayMs(attempt: number): number {
  // 2 min, 4 min, 8 min, 16 min, 32 min
  return Math.min(2 * 60_000 * Math.pow(2, attempt), 32 * 60_000);
}

/** Timeout d'envoi par défaut (ms) */
export const SEND_TIMEOUT_MS = 15_000;

/** Seuil d'erreurs consécutives avant de marquer un fournisseur "down" */
export const CONSECUTIVE_ERROR_THRESHOLD = 5;

/** Seuil d'erreurs consécutives pour "degraded" */
export const CONSECUTIVE_ERROR_DEGRADED = 2;
