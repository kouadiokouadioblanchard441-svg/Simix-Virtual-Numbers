import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.sparkpost.com/api/v1";

export const sparkpostAdapter: ProviderAdapter = {
  slug: "sparkpost",
  name: "SparkPost",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("SparkPost: apiKey manquante");
    const res = await fetch(`${BASE}/transmissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: config.apiKey },
      body: JSON.stringify({
        recipients: [{ address: { email: payload.to } }],
        content: {
          from:    payload.from,
          subject: payload.subject,
          html:    payload.html,
          text:    payload.text,
        },
      }),
    });
    const body = await res.json() as { results?: { id: string }; errors?: { message: string }[] };
    if (!res.ok) throw new Error(`SparkPost: ${body.errors?.[0]?.message ?? res.statusText}`);
    return { messageId: body.results?.id ?? "sparkpost-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/account`, {
        headers: { Authorization: config.apiKey },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
