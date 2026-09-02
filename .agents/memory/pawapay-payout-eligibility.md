---
name: PawaPay payout eligibility
description: Source-of-truth rule for deciding which PawaPay providers may receive merchant payouts.
---

PawaPay provider identifiers must be country-qualified, but a syntactically valid identifier does not mean the merchant account may use it. Only providers whose active merchant configuration exposes a `PAYOUT` operation may appear in the withdrawal UI or be submitted.

**Why:** PawaPay accepts the provider format but rejects the payout with `PAYOUTS_NOT_ALLOWED` when that provider has not been enabled for the merchant account.

PawaPay v2 exposes this data at `/v2/active-conf`. Each currency's `operationTypes` is an array of keyed objects (for example `[{ "PAYOUT": { ... } }]`), not one object with a direct `PAYOUT` property.

**How to apply:** Query active configuration with `operationType=PAYOUT`, search the `operationTypes` array, retain static country/operator mapping only for identifier normalization, and validate eligibility server-side before creating a payout. Validate and sanitize the MSISDN with `predict-provider`.