---
name: Telegram alert scope
description: User-defined event coverage and privacy boundary for Telegram notifications.
---

Cover meaningful authentication attempts, OTP lifecycle status, confirmed recharge credits, and administrator actions in Telegram alerts.

Forward every saved user support message to the admin Telegram chat with the sender name and user/conversation ID. The user explicitly approved forwarding attached images even though image contents cannot be reliably screened for secrets.

Adding Telegram support alerts must not change the existing support chat flow, including AI responses and human-takeover behavior or limits, unless the user explicitly asks.

**Why:** The user explicitly requested all notification categories, including administrator actions, explicitly approved forwarding support images, and clarified that Telegram additions must preserve existing support behavior.

**How to apply:** Preserve the support chat behavior when adding notifications. Report OTP and payment-code status only. Never send OTP values, passwords, API keys, or other credentials in text; redact explicitly labeled secret values in support messages. Forward support images as requested, noting that they may contain secrets.
