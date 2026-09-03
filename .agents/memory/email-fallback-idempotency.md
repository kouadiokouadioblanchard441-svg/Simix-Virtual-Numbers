---
name: Email fallback idempotency
description: Rules that prevent duplicate transactional emails during provider fallback and retries.
---

When an email provider times out after a request may have been accepted, persist an affinity to that same provider and retry only there with the same provider idempotency key. Never fail over that ambiguous attempt to another provider.

**Why:** Provider-local idempotency cannot deduplicate a second send made through a different provider. A Brevo response timeout followed by Resend fallback can therefore deliver two copies.

**How to apply:** Use a durable unique issuance identifier for each logical message. Keep the queue claim atomic, pass the same key to provider retries, and clear affinity only after a definitive non-acceptance or a confirmed success.