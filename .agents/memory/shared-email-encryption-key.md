---
name: Shared email encryption key
description: Credential encryption requirements when Replit and Plesk share the same email provider database.
---

All API environments that read and write `email_providers` must use the same dedicated `ENCRYPTION_KEY`. Do not rely on environment-specific `SESSION_SECRET` values when the database is shared.

When `BREVO_API_KEY` is set on the server, Brevo uses that environment value before any encrypted database key; the database value remains only a compatibility fallback when the variable is absent.

**Why:** AES-GCM ciphertext written by one environment can exist and look configured while decrypting to an empty value in another environment, causing runtime `apiKey manquante` failures.

**How to apply:** Configure one stable `ENCRYPTION_KEY` in every API environment that needs database credentials. For Brevo, set `BREVO_API_KEY` in the Plesk environment and restart the app; the admin status will show the environment source.