---
name: Server-side account security
description: Product decision for Simix PIN protection, email 2FA, and administrator sessions.
---

Keep PIN verification and its attempt lockout on the server; the browser may keep only a user-scoped, tab-session hint that the UI has already unlocked. PINs are stored as server-side password hashes, not in browser storage.

Real login 2FA uses an expiring, one-use email code through the existing email manager. Never include the code in Telegram alerts or logs. Admin JWTs are delivered in an HttpOnly cookie, not a JSON response or browser storage.

**Why:** the user explicitly chose to migrate these controls to the server and use email for 2FA.

**How to apply:** deploy the account-security migration on Plesk before enabling these settings. Replit preview must not apply migrations to the database shared with Plesk.
