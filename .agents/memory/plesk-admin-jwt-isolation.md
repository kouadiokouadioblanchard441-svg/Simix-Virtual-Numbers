---
name: Plesk admin JWT isolation
description: Why Replit cannot mint an administrative session accepted by the Plesk production API.
---

The Replit environment's admin JWT signing secret is not accepted by the Plesk production API.

**Why:** A correctly formed, short-lived token signed inside Replit is rejected by production as invalid, while the protected route itself is healthy and correctly returns authentication errors.

**How to apply:** Treat production admin verification as requiring a real Plesk-issued admin session. Do not infer live provider state or perform targeted production email tests from Replit alone.