---
name: Referral balance isolation & withdrawal reservation
description: Referral bonuses are isolated from the main wallet and withdrawn via a reserve-on-request flow, not auto-credited.
---

Referral commissions must never be added to `users.balance` (the main spendable wallet). They only increment `users.referralEarnings` (lifetime total, display-only) and `users.referralBalance` (current withdrawable amount).

**Why:** the product requires referral bonuses to stay isolated in the "parrainage" section and only leave the system through an admin-validated withdrawal request to a mobile money number — not be spendable directly or silently merged into the wallet.

**How to apply:** when crediting a referral commission (see `numbers.ts` purchase flow), only touch `referralEarnings`/`referralBalance`. Withdrawal requests use a reservation model: on `POST /referral/withdraw`, the full `referralBalance` is zeroed and a `pending` `referral_withdrawals` row is created in the same DB transaction (row-locked to prevent double withdrawal). Admin approval leaves the balance as-is (funds already spent); admin rejection refunds the amount back to `referralBalance`. Both admin transitions must guard on `status = 'pending'` inside a locked transaction to avoid double-processing/double-refund races under concurrent admin actions.
