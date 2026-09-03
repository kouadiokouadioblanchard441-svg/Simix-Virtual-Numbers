import { getEmailManager } from "./email-router";
import type { EmailPayload, SendResult, AdapterSendResult, ProviderStats } from "./email-router/types";

/**
 * Façade unique de l'application pour tout envoi d'email.
 * Les routes et services applicatifs ne connaissent jamais les adaptateurs.
 */
export const emailService = {
  send(payload: EmailPayload): Promise<SendResult> {
    return getEmailManager().send(payload);
  },
  testProvider(providerId: string, payload: EmailPayload): Promise<AdapterSendResult> {
    return getEmailManager().testProvider(providerId, payload);
  },
  invalidateCache(): void {
    getEmailManager().invalidateCache();
  },
  runHealthChecks(): Promise<void> {
    return getEmailManager().runHealthChecks();
  },
  processRetryQueue(): Promise<void> {
    return getEmailManager().processRetryQueue();
  },
  startBackgroundWorkers(): void {
    getEmailManager().startBackgroundWorkers();
  },
  getStats(): Promise<ProviderStats[]> {
    return getEmailManager().getStats();
  },
};