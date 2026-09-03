import { Resend } from "resend";
import {
  ProviderSendError,
  type ProviderAdapter,
  type AdapterConfig,
  type EmailPayload,
  type AdapterSendResult,
  type HealthCheckResult,
} from "../types";

export const resendAdapter: ProviderAdapter = {
  slug: "resend",
  name: "Resend",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Resend: apiKey manquante");
    const client = new Resend(config.apiKey);
    let response: Awaited<ReturnType<typeof client.emails.send>>;
    try {
      response = await client.emails.send({
        from:    payload.from!,
        to:      [payload.to],
        subject: payload.subject,
        html:    payload.html,
        text:    payload.text,
      }, payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined);
    } catch (cause) {
      const code = (cause as { cause?: { code?: string }; code?: string }).cause?.code
        ?? (cause as { code?: string }).code;
      const definitelyNotSent = new Set([
        "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT",
      ]).has(code ?? "");
      throw new ProviderSendError("Resend: erreur réseau", {
        // Une panne de résolution/connexion n'a jamais atteint l'API :
        // le fallback est sûr. Un autre échec réseau reste ambigu car la
        // requête a pu être acceptée avant la coupure.
        kind: definitelyNotSent ? "temporary" : "ambiguous",
        code,
        cause,
      });
    }
    const { data, error } = response;
    if (error) {
      const status = (error as { statusCode?: number }).statusCode;
      const code = (error as { name?: string }).name;
      const temporaryCodes = new Set([
        "monthly_quota_exceeded", "daily_quota_exceeded", "rate_limit_exceeded",
        "application_error", "internal_server_error", "concurrent_idempotent_requests",
        "invalid_api_key", "restricted_api_key",
      ]);
      const kind = status === 429 || (status != null && status >= 500) || temporaryCodes.has(code ?? "")
        ? "temporary"
        : "definitive";
      throw new ProviderSendError(`Resend${status ? ` HTTP ${status}` : ""}: ${error.message}`, {
        kind,
        status,
        code,
      });
    }
    return { messageId: data?.id ?? "resend-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    const start = Date.now();
    try {
      const client = new Resend(config.apiKey);
      // Appel léger — liste les domaines (pas d'envoi)
      await client.domains.list();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
