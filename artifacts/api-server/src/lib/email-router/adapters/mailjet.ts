import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.mailjet.com/v3.1";

export const mailjetAdapter: ProviderAdapter = {
  slug: "mailjet",
  name: "Mailjet",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey || !config.apiSecret) throw new Error("Mailjet: apiKey et apiSecret requis");
    const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
    const res  = await fetch(`${BASE}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        Messages: [{
          From:     { Email: payload.from },
          To:       [{ Email: payload.to }],
          Subject:  payload.subject,
          HTMLPart: payload.html,
          TextPart: payload.text,
        }],
      }),
    });
    const body = await res.json() as { Messages?: { Status: string; To: { MessageID: number }[] }[]; ErrorMessage?: string };
    if (!res.ok || body.Messages?.[0]?.Status !== "success") {
      throw new Error(`Mailjet HTTP ${res.status}: ${body.ErrorMessage ?? res.statusText}`);
    }
    return { messageId: String(body.Messages?.[0]?.To?.[0]?.MessageID ?? "mailjet-unknown") };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey || !config.apiSecret) return { healthy: false, latencyMs: 0, detail: "apiKey/apiSecret manquant" };
    const start = Date.now();
    const auth  = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64");
    try {
      const res = await fetch("https://api.mailjet.com/v3/REST/apikey", {
        headers: { Authorization: `Basic ${auth}` },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
