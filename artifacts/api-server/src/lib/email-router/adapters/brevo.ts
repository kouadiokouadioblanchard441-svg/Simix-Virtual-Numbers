import {
  ProviderSendError,
  type ProviderAdapter,
  type AdapterConfig,
  type EmailPayload,
  type AdapterSendResult,
  type HealthCheckResult,
} from "../types";

const BASE = "https://api.brevo.com/v3";

function parseSender(from?: string): { email: string; name?: string } {
  const value = from?.trim() ?? "";
  const named = value.match(/^(.*?)\s*<([^<>]+)>$/);
  if (named) {
    const name = named[1].trim();
    return name ? { email: named[2].trim(), name } : { email: named[2].trim() };
  }
  return { email: value };
}

export const brevoAdapter: ProviderAdapter = {
  slug: "brevo",
  name: "Brevo (Sendinblue)",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Brevo: apiKey manquante");
    const sender = parseSender(payload.from);
    if (!sender.email) throw new Error("Brevo: adresse expéditeur manquante");

    let res: Response;
    try {
      res = await fetch(`${BASE}/smtp/email`, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "api-key": config.apiKey,
          ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          sender,
          to: [{ email: payload.to }],
          subject: payload.subject,
          htmlContent: payload.html,
          textContent: payload.text,
        }),
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code
        ?? (error as { code?: string }).code;
      const definitelyNotSent = new Set([
        "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT",
      ]).has(code ?? "");
      throw new ProviderSendError("Brevo: erreur réseau", {
        kind: definitelyNotSent ? "temporary" : "ambiguous",
        code,
        cause: error,
      });
    }

    const responseText = await res.text();
    let body: { messageId?: string; message?: string } = {};
    try {
      body = JSON.parse(responseText) as typeof body;
    } catch {
      /* Brevo may return non-JSON text for gateway/proxy errors. */
    }

    if (!res.ok) {
      const detail = body.message ?? (responseText.slice(0, 300) || res.statusText);
      const kind = res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403
        ? "temporary"
        : "definitive";
      throw new ProviderSendError(`Brevo HTTP ${res.status}: ${detail}`, {
        kind,
        status: res.status,
      });
    }
    return { messageId: body.messageId ?? "brevo-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/account`, {
        headers: { "api-key": config.apiKey },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
