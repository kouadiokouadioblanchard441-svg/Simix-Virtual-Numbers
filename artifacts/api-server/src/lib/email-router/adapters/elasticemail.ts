import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.elasticemail.com/v4";

export const elasticemailAdapter: ProviderAdapter = {
  slug: "elasticemail",
  name: "Elastic Email",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Elastic Email: apiKey manquante");
    const res = await fetch(`${BASE}/emails/transactional`, {
      method: "POST",
      headers: {
        "Content-Type":           "application/json",
        "X-ElasticEmail-ApiKey":  config.apiKey,
      },
      body: JSON.stringify({
        Recipients: { To: [payload.to] },
        Content: {
          From:    payload.from,
          Subject: payload.subject,
          Body: [
            { ContentType: "HTML",      Content: payload.html },
            ...(payload.text ? [{ ContentType: "PlainText", Content: payload.text }] : []),
          ],
        },
      }),
    });
    const body = await res.json() as { TransactionID?: string; Error?: string };
    if (!res.ok) throw new Error(`Elastic Email HTTP ${res.status}: ${body.Error ?? res.statusText}`);
    return { messageId: body.TransactionID ?? "elasticemail-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/accounts`, {
        headers: { "X-ElasticEmail-ApiKey": config.apiKey },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
