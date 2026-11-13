---
name: Virtual-number validity policy
description: Product rules for activation-number expiry, paid extensions, and manual cancellation.
---

Activation numbers are valid for 20 minutes before any optional paid extension. Manual number cancellation is not allowed for customers or administrators; the user waits for the SMS or expiry. Automatic provider-side closure at expiry remains part of expiry cleanup.

**Why:** the user asked that all surfaces agree on 20 minutes and that nobody can manually cancel a number.

**How to apply:** enforce the 20-minute initial window in server logic and communicate the optional extension separately. Do not add user or admin cancellation controls or routes that mutate number state.
