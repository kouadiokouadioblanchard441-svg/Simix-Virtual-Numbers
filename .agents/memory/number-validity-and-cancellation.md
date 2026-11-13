---
name: Virtual-number validity policy
description: Product rules for activation-number expiry, paid extensions, and manual cancellation.
---

Activation numbers have a 20-minute local countdown and no paid extension. For activation orders with a 5sim order ID, the provider's terminal `TIMEOUT` ends the order and triggers a refund if no SMS is stored. Manual number cancellation is not allowed for customers or administrators.

**Why:** the user chose 5sim's final timeout as the authoritative result, removed paid extensions, and asked that nobody manually cancel a number.

**How to apply:** keep the 20-minute countdown visible, but continue checking activation orders until 5sim returns a terminal status. Do not add extension controls/routes or user/admin cancellation controls.
