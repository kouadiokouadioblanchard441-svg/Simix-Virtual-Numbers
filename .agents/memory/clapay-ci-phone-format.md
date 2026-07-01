---
name: Clapay CI/BJ phone format
description: Clapay rejects E.164 format for CI and BJ — expects local 10-digit number only.
---

# Clapay phone number format — CI and BJ

## The rule
For Côte d'Ivoire (CI) and Benin (BJ), Clapay rejects E.164 format (`+2250595857098`) with `ERROR_PHONE_NUMBER_LENGTH_IS_TOO_SHORT` and expects **only the raw local number** (`0595857098`).

**Why:** Confirmed by live API testing — all E.164 variants returned HTTP 400. Local format `0595857098` returned HTTP 200 with a valid payment_url.

**How to apply:** `LOCAL_FORMAT_ONLY_COUNTRIES = Set(["CI", "BJ"])` in `artifacts/api-server/src/lib/clapay.ts`. The `formatClapayPhone()` function strips the country code and ensures leading 0 is present for these countries, returning just the local number.
