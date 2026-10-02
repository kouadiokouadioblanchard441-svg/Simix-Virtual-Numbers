---
name: Clapay official contract
description: Resolving misleading legacy assumptions about direct-mode enum, operator identifiers and payment verification.
---

Use the official payment-mode and initiation guides over legacy comments or generic DTO examples: direct mode is `API`, not `DIRECT`, the initiation guide explicitly specifies short operator identifiers, and its request examples put `customer_phone` inside `additional_infos`.

**Why:** The previous client contained contradictory comments about operator identifiers and incorrectly claimed that payment-status polling did not exist. The generic response DTO describes checkout fields and omits API-specific operator actions.

**How to apply:** Consult https://docs.clapay.app/docs/nowallet/payment-modes, https://docs.clapay.app/docs/nowallet/payment/init-payment and https://docs.clapay.app/docs/nowallet/payment/check-status before changing this integration. Distinguish a Wave operator link from hosted checkout, and a returned MyNita purchase code from a user-supplied operator OTP. Verify provider settlement rather than trusting an initiation response or an unauthenticated callback.

Merchant payouts use `CASHIN` with the `API` tunnel, not a guessed `CASHOUT` operation. Operator capability and OTP requirements must also come from `CASHIN`, while the submitted operator identifier remains the short catalogue code.

**Why:** English withdrawal terminology and legacy client method names misleadingly suggested a separate cashout endpoint; the official payment-mode and initiation DTO documentation explicitly describes `CASHIN (PAYOUT)`.

**How to apply:** Check https://docs.clapay.app/docs/nowallet/schemas/InitPaymentModelDTO and https://docs.clapay.app/docs/nowallet/metadata/operators-data when modifying payouts. Unlike PawaPay's documented UUID-based idempotence, Clapay initiation must not be resubmitted after an uncertain outcome. Recover a missing signature only from a callback candidate checked against the authenticated status API and the original immutable transaction identity.

The live operator catalogue can omit the entire legacy `code` object while retaining active operators, short `codeoperator`, and method-specific OTP/instruction data. Missing long-code metadata is not proof that an operator is unavailable; still reject inactive operators and explicit method denials.

**Why:** A real BF catalogue returned active Orange Money with short code `OM` and `otpstarter.MERCHANT: true`, but no `code` property. Requiring `code.MERCHANT` rejected a valid configured deposit method despite the documented initiation using only the short identifier.

**How to apply:** Verify the actual metadata endpoint shape, not just its richer documentation example. Preserve the returned OTP requirement and use the returned short code; never fabricate a provider identifier or regard catalogue eligibility as confirmed payment success.

Site-enabled deposit methods do not establish Clapay coverage. Check the selected account's country and operator catalogues before treating every unavailable-method error as the same bug. Brand aliases must be verified and scoped to their country; they may select only a real eligible catalogue entry.

**Why:** A cross-country check found both legitimate local brand-name differences and site-enabled countries absent from Clapay's country list, whose operator endpoints returned 404. Fixing optional metadata did not make those missing countries/operators available.

**How to apply:** Distinguish matching errors, explicit operator denials, missing provider countries/operators and failed catalogue requests. Catalogue diagnostics must use the same per-country/operator account and routing resolution as deposits, not assume the global Clapay account. Do not invent codes, change ISO codes, disable site configurations or switch gateways merely to make the error disappear.

Do not switch Wave to hosted checkout merely because Clapay returns a field named `payment_url`. The official initiation guide allows both `payment_url` and `payment_url_operator` for operator payment completion, including Wave within the API tunnel.

**Why:** The response DTO and examples associate `payment_url` with hosted checkout, but the guide's operator-completion section explicitly permits either field. Treating the field name as the tunnel discards valid links or changes unrelated payment flows.

**How to apply:** Interpret links using the actual request tunnel. Preserve the pending deposit before opening the supplied link, offer the documented QR/mobile opening action, and continue to require verified provider settlement before crediting the wallet.