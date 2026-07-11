import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

export const mailgunAdapter: ProviderAdapter = {
  slug: "mailgun",
  name: "Mailgun",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Mailgun: apiKey manquante");
    if (!config.domain) throw new Error("Mailgun: domain manquant");
    const region = config.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
    const url    = `https://${region}/v3/${config.domain}/messages`;
    const form   = new URLSearchParams({
      from:    payload.from!,
      to:      payload.to,
      subject: payload.subject,
      html:    payload.html,
      ...(payload.text ? { text: payload.text } : {}),
    });
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`api:${config.apiKey}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const body = await res.json() as { id?: string; message?: string };
    if (!res.ok) throw new Error(`Mailgun: ${body.message ?? res.statusText}`);
    return { messageId: body.id ?? "mailgun-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey || !config.domain) return { healthy: false, latencyMs: 0, detail: "apiKey/domain manquant" };
    const start  = Date.now();
    const region = config.region === "eu" ? "api.eu.mailgun.net" : "api.mailgun.net";
    try {
      const res = await fetch(`https://${region}/v3/domains/${config.domain}`, {
        headers: { Authorization: "Basic " + Buffer.from(`api:${config.apiKey}`).toString("base64") },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start, detail: res.ok ? undefined : String(res.status) };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
