---
name: Brevo authorized IP allowlist
description: Brevo API authentication can fail because the server egress IP is not authorized, even when the encrypted key decrypts correctly.
---

Brevo may return HTTP 401 with an “unrecognised IP address” message when the API key is restricted by an authorized-IP policy. This is not proof that the key is invalid.

**Why:** A valid Brevo key stored in the shared database was decryptable, while `/v3/account` rejected the request solely because the Replit egress IP was not allowlisted.

**How to apply:** Read the provider health error in the admin panel and add the exact runtime server egress IP in Brevo Security → Authorised IPs. Add the Plesk server IP separately when production sends from Plesk.