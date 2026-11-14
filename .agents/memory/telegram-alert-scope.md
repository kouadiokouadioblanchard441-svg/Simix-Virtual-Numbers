---
name: Telegram alert scope
description: User-defined event coverage and privacy boundary for Telegram notifications.
---

Cover meaningful authentication attempts, OTP lifecycle status, confirmed recharge credits, and administrator actions in Telegram alerts.

**Why:** The user explicitly requested all notification categories, including administrator actions.

**How to apply:** Report OTP and payment-code status only. Never send OTP values, passwords, API keys, or other credentials to Telegram.
