---
name: Telegram alert scope
description: User-defined event coverage and privacy boundary for Telegram notifications.
---

Cover meaningful authentication attempts, OTP lifecycle status, confirmed recharge credits, and administrator actions in Telegram alerts.

Forward every saved user support message to the admin Telegram chat with the sender name and user/conversation ID. The user explicitly approved forwarding attached images even though image contents cannot be reliably screened for secrets.

**Why:** The user explicitly requested all notification categories, including administrator actions, and explicitly approved forwarding support images.

**How to apply:** Report OTP and payment-code status only. Never send OTP values, passwords, API keys, or other credentials in text; redact explicitly labeled secret values in support messages. Forward support images as requested, noting that they may contain secrets.
