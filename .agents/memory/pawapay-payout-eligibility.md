---
name: PawaPay payout eligibility
description: Source-of-truth rule for deciding which PawaPay providers may receive merchant payouts.
---

PawaPay provider identifiers must be country-qualified, but a syntactically valid identifier does not mean the merchant account may use it. The admin UI should show the complete country/operator payout catalogue and clearly mark unavailable methods; only providers whose active merchant configuration exposes `PAYOUT` may be submitted.

**Why:** Hiding providers when the live configuration is empty makes the catalogue unusable and prevents administrators from seeing what should be enabled. PawaPay still rejects unauthorized submissions with `PAYOUTS_NOT_ALLOWED`.

PawaPay v2 exposes this data at `/v2/active-conf`. Each currency's `operationTypes` is an array of keyed objects (for example `[{ "PAYOUT": { ... } }]`), not one object with a direct `PAYOUT` property.

**How to apply:** Build the visible list from the country-qualified static payout catalogue, annotate it from active configuration queried with `operationType=PAYOUT`, and validate eligibility server-side before creating a payout. Validate and sanitize the MSISDN with `predict-provider`.