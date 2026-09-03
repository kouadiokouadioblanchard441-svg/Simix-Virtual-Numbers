---
name: Shared email encryption key
description: Credential encryption requirements when Replit and Plesk share the same email provider database.
---

All API environments that read and write `email_providers` must use the same dedicated `ENCRYPTION_KEY`. Do not rely on environment-specific `SESSION_SECRET` values when the database is shared.

**Why:** AES-GCM ciphertext written by one environment can exist and look configured while decrypting to an empty value in another environment, causing runtime `apiKey manquante` failures.

**How to apply:** Configure one stable `ENCRYPTION_KEY` in every API environment, replace provider credentials once through the target admin panel, and treat successful decryption—not ciphertext presence—as the configured check.