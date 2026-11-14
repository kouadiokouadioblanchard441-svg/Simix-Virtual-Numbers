---
name: Telegram credentials on Plesk
description: User decision to keep the Telegram bot token and destination settings in Plesk environment variables only.
---

Read Telegram bot configuration only from Plesk environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and optional `TELEGRAM_ALERTS_ENABLED`. Do not use or expose Telegram credentials through database-backed admin settings.

**Why:** the user chose Plesk as the sole configuration source for the Telegram bot.

**How to apply:** configure the variables in Plesk and restart the app. Alerts require both token and chat ID; the optional enabled flag defaults on and can disable alerts with `false`, `0`, `no`, or `off`.
