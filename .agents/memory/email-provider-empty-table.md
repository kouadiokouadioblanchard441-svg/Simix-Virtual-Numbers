---
    name: Email provider table empty despite valid API key in settings
    description: Why Resend emails silently failed even though system_settings had a valid resend_api_key, and how the auto-seed gap was fixed.
    ---

    **Symptom:** `email_providers` table was completely empty (0 rows) even though `system_settings.resend_api_key` held a valid key. Every send failed with "Aucun fournisseur actif" and queued failures never got a working retry, because the manager's seed logic (`seedResendFromSettings()`) only runs lazily on first `getProviders()` call when the in-memory provider cache is empty. If that path never fires as expected, the table can stay empty indefinitely.

    **Why:** auto-seed is lazy and silent — no boot-time log makes the gap obvious, and the queue's "Aucun fournisseur actif" failures look identical to a temporary outage rather than a missing provider row.

    **How to apply:** When email sends fail with "Aucun fournisseur actif" / "apiKey manquante", check `SELECT * FROM email_providers` directly (via the app's real DB, not Replit's `executeSql`). If empty, seed a row manually: encrypt `system_settings.resend_api_key` with AES-256-GCM using SHA-256(SESSION_SECRET) as key (see `lib/email-router/crypto.ts`), insert into `email_providers` (slug='resend', active=true). Verify via the admin API `GET /admin/email-providers` (apiKeyMasked should show a real masked value) or the `/admin/email-providers/:id/test` endpoint before relying on the background retry queue.

    **Also found:** the OTP emails that had been silently failing for days still had their *original* OTP code baked into the HTML with a 10-minute expiry — resending the queued email does NOT help the user, since the code is long expired. Use `scripts/src/resend-otps.ts` (`RESEND_API_KEY=<key> pnpm --filter @workspace/scripts run resend-otps`) to invalidate old codes and issue + send fresh ones for all `email_verified=false` users at once, rather than manually replaying the failed queue.

    **Latent bug noticed (not yet fixed):** `EmailProviderManager.processRetryQueue`'s failure branch unconditionally sets `status` back to `pending`/`failed` without checking whether a concurrent/overlapping attempt already marked the same queue row `sent`. Observed one row where a failure log and a success log for the same queue_id landed ~20ms apart, leaving `status='pending'` with `sent_at` already populated. Low-frequency but could cause a duplicate resend later.
    