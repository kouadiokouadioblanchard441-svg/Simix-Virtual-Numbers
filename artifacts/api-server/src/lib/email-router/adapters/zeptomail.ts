import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

const BASE = "https://api.zeptomail.com/v1.1";

export const zeptomailAdapter: ProviderAdapter = {
  slug: "zeptomail",
  name: "ZeptoMail",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("ZeptoMail: apiKey manquante");
    const res = await fetch(`${BASE}/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Zoho-enczapikey ${config.apiKey}`,
      },
      body: JSON.stringify({
        from:    { address: payload.from },
        to:      [{ email_address: { address: payload.to } }],
        subject: payload.subject,
        htmlbody: payload.html,
        textbody: payload.text,
      }),
    });
    const body = await res.json() as { data?: { message_id: string }[]; message?: string };
    if (!res.ok) throw new Error(`ZeptoMail: ${body.message ?? res.statusText}`);
    return { messageId: body.data?.[0]?.message_id ?? "zeptomail-unknown" };
  },

  async healthCheck(config: AdapterConfig): Promise<HealthCheckResult> {
    if (!config.apiKey) return { healthy: false, latencyMs: 0, detail: "apiKey manquante" };
    // ZeptoMail n'a pas d'endpoint de health — on tente un envoi invalide et on vérifie l'auth
    const start = Date.now();
    try {
      const res = await fetch(`${BASE}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Zoho-enczapikey ${config.apiKey}` },
        body: JSON.stringify({}),
      });
      // 401 = clé invalide ; 400 = clé valide mais payload invalide (normal)
      const healthy = res.status !== 401;
      return { healthy, latencyMs: Date.now() - start, detail: healthy ? undefined : "Clé API invalide" };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, detail: String(err) };
    }
  },
};
