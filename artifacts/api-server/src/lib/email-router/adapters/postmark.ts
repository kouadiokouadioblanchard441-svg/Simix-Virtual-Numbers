import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.postmarkapp.com";

export const postmarkAdapter: ProviderAdapter = {
  slug: "postmark",
  name: "Postmark",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Postmark: apiKey manquante");
    const res = await fetch(`${BASE}/email`, {
      method: "POST",
      headers: {
        "Content-Type":             "application/json",
        "Accept":                   "application/json",
        "X-Postmark-Server-Token":  config.apiKey,
      },
      body: JSON.stringify({
        From:         payload.from,
        To:           payload.to,
        Subject:      payload.subject,
        HtmlBody:     payload.html,
        TextBody:     payload.text,
        MessageStream: "outbound",
      }),
    });
    const body = await res.json() as { MessageID?: string; ErrorCode?: number; Message?: string };
    if (!res.ok || body.ErrorCode) throw new Error(`Postmark: ${body.Message ?? res.statusText}`);
    return { messageId: body.MessageID ?? "postmark-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/server`, {
        headers: { "X-Postmark-Account-Token": config.apiKey, "Accept": "application/json" },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
