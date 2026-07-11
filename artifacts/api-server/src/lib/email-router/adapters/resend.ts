import { Resend } from "resend";
import type { ProviderAdapter, AdapterConfig, EmailPayload, AdapterSendResult, HealthCheckResult } from "../types";

export const resendAdapter: ProviderAdapter = {
  slug: "resend",
  name: "Resend",

  async send(payload: EmailPayload, config: AdapterConfig): Promise<AdapterSendResult> {
    if (!config.apiKey) throw new Error("Resend: apiKey manquante");
    const client = new Resend(config.apiKey);
    const { data, error } = await client.emails.send({
      from:    payload.from!,
      to:      [payload.to],
      subject: payload.subject,
      html:    payload.html,
      text:    payload.text,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
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
