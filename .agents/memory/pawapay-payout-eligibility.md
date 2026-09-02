---
name: PawaPay payout eligibility
description: Source-of-truth rule for deciding which PawaPay providers may receive merchant payouts.
---

PawaPay provider identifiers must be country-qualified, but a syntactically valid identifier does not mean the merchant account may use it. Only providers whose active merchant configuration exposes a `PAYOUT` operation may appear in the withdrawal UI or be submitted.

**Why:** PawaPay accepts the provider format but rejects the payout with `PAYOUTS_NOT_ALLOWED` when that provider has not been enabled for the merchant account.

**How to apply:** Use the live active-configuration response as the eligibility source of truth, retain static country/operator mapping only for identifier normalization, and validate eligibility server-side before creating a payout.