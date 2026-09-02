---
name: Transactional email visual style
description: Durable visual rules for Simix authentication and OTP emails.
---

Simix authentication emails should use one shared, table-based template with inline styles: pale gray page background, centered white card, restrained blue accent, clean system sans-serif typography, generous spacing, prominent code block, and a concise security note.

**Why:** Email clients strip or inconsistently support external CSS and webfonts; inline styles and a system font stack keep the professional reference look reliable in Gmail, Outlook, and mobile clients.

**How to apply:** Reuse the shared authentication template for registration OTPs, inactivity verification, and password reset emails. Keep codes escaped, single-use, time-limited, and never expose them in logs.