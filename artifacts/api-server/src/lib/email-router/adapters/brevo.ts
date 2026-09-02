import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.brevo.com/v3";

export const brevoAdapter: ProviderAdapter = {
  slug: "brevo",
  name: "Brevo (Sendinblue)",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Brevo: apiKey manquante");
    const res = await fetch(`${BASE}/smtp/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key":       config.apiKey,
      },
      body: JSON.stringify({
        sender:   { email: payload.from },
        to:       [{ email: payload.to }],
        subject:  payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
      }),
    });
    const body = await res.json() as { messageId?: string; message?: string };
    if (!res.ok) throw new Error(`Brevo HTTP ${res.status}: ${body.message ?? res.statusText}`);
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
