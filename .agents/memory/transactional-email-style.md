---
name: Transactional email visual style
description: Durable visual rules for Simix authentication and OTP emails.
---

Simix authentication and recharge emails use the same reference-led visual language: pale gray page, dark brand banner, white card, violet Simix accents, Arial/Helvetica typography, prominent code or amount, and a concise security note.

**Why:** Email clients strip or inconsistently support external CSS and webfonts; inline styles and a system font stack keep the professional reference look reliable in Gmail, Outlook, and mobile clients.

**How to apply:** Reuse the shared authentication template for registration OTPs, inactivity verification, and password reset; keep recharge confirmations visually aligned. Keep dynamic values escaped and never expose codes in logs.