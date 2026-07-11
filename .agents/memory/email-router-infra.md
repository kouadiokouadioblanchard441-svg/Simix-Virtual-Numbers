---
name: Email Router Infrastructure
description: Multi-provider email system with failover, retry queue, health checks — architecture decisions and gotchas
---

## Architecture

- **Manager singleton** at `artifacts/api-server/src/lib/email-router/manager.ts` — loaded via `getEmailManager()`
- **10 adapters** in `adapters/` (resend, ses, postmark, mailgun, sendgrid, brevo, mailjet, sparkpost, zeptomail, elasticemail)
- **3 new DB tables**: `email_providers`, `email_queue`, `email_send_logs` — migration `0017_email_providers`
- **`email.ts`** now delegates all 3 transactional sends through `getEmailManager().send()`

## Critical rules

**Background workers must be started at boot.** `getEmailManager().startBackgroundWorkers()` is called in `artifacts/api-server/src/index.ts` inside the `seedProvidersFromEnv().then(...)` block alongside the other pollers. If workers are missing, queued emails are never retried and provider health never updates.

**`adminEmailProvidersRouter` must be mounted BEFORE `adminRouter`** in `routes/index.ts`. Mounting it after causes the adminRouter's catch-all to shadow the email-provider routes and return "Admin session required" for all of them.

**`SESSION_SECRET` doubles as encryption key.** `crypto.ts` derives the AES-256-GCM key from `ENCRYPTION_KEY ?? SESSION_SECRET`. Fails fast (throws) if neither is set — no hardcoded fallback. `SESSION_SECRET` is always set so this works in production.

**`maskApiKey()` must receive the decrypted key**, not the ciphertext. `safeProvider()` calls `decrypt(r.apiKeyEnc)` then passes the result to `maskApiKey()`.

**Auto-seed:** manager auto-seeds Resend from `system_settings.resend_api_key` if `email_providers` is empty — zero downtime migration from the single-provider system.

## SQL increment pattern

Drizzle atomic increments use: `sql\`${emailProvidersTable.totalSent} + 1\`` — NOT `db.raw()` (doesn't exist in Drizzle).

## Supported providers

resend, ses (SigV4 native — no AWS SDK), postmark, mailgun, sendgrid, brevo, mailjet (needs apiKey+apiSecret), sparkpost, zeptomail, elasticemail
