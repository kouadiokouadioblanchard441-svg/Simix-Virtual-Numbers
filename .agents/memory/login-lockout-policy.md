---
name: Login lockout policy
description: User-defined temporary lockout behavior for the standard account login page.
---

After more than five failed password attempts, temporarily block the account for ten minutes. For known accounts, the lock follows the account ID across its supported login identifiers; unknown identifiers use a separate temporary key.

Apply account lockouts to the email/password login form only. Google OAuth must not share those form-specific counters or lockouts.

**Why:** The user requested a ten-minute block after more than five login attempts.

**How to apply:** Count failed authentication attempts, not successful logins. Keep email/password form limits separate from Google OAuth; preserve other login and verification flows unless the user explicitly asks to change them.
