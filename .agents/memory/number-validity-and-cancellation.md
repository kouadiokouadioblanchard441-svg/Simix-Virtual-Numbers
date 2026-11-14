---
name: Virtual-number validity policy
description: Product rules for activation-number expiry, paid extensions, and manual cancellation.
---

Activation and hosting numbers use the exact expiration timestamp returned by 5sim; never calculate a fixed 20-minute local deadline. Persist and refresh that timestamp so the UI countdown and server-side expiry agree. A terminal provider `TIMEOUT` triggers a refund if no SMS is stored. Paid extensions and manual number cancellation are not available to customers or administrators.

**Why:** the user replaced the fixed 20-minute rule with 5sim's own expiration time, kept its terminal result as the refund source of truth, removed paid extensions, and asked that nobody manually cancel a number.

**How to apply:** on purchase, set `expiresAt` from the provider response; refresh it from activation status checks. Continue polling after the countdown reaches zero until the provider returns a terminal status. Do not add extension controls/routes or user/admin cancellation controls.
