import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.sendgrid.com/v3";

export const sendgridAdapter: ProviderAdapter = {
  slug: "sendgrid",
  name: "SendGrid",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("SendGrid: apiKey manquante");
    const res = await fetch(`${BASE}/mail/send`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from:    { email: payload.from },
        subject: payload.subject,
        content: [
          { type: "text/html", value: payload.html },
          ...(payload.text ? [{ type: "text/plain", value: payload.text }] : []),
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { errors?: { message: string }[] };
      throw new Error(`SendGrid HTTP ${res.status}: ${body.errors?.[0]?.message ?? res.statusText}`);
    }
    // SendGrid renvoie 202 sans corps — message-id dans header
    const msgId = res.headers.get("X-Message-Id") ?? "sendgrid-unknown";
    return { messageId: msgId };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/user/profile`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
