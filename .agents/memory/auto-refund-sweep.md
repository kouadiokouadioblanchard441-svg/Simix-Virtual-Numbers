---
name: Auto-refund bug and sweep
description: Rules for atomic, exactly-once refunds after real number expiry, including activation and hosting safeguards.
---

## Activation-order refunds
- A terminal 5sim `TIMEOUT` is authoritative for activation orders. Save any SMS in the response first; if none is stored, atomically expire and refund once, regardless of the local 20-minute display timer.
- Continue polling activation orders with a provider order ID after the local timer reaches zero, until 5sim reports a terminal result.
- The local-expiry sweep is a safety net for hosting rentals and activation records without a provider order ID; it also recovers old terminal rows missing a refund.
- The worker checks every 15 seconds and runs a refund sweep every minute, including at startup.
- SMS persistence and refund decisions lock the virtual-number row, preventing a race from crediting a number whose SMS was saved at the same time.
- Purchase and refund transactions both link to the virtual number. Use the ambiguous two-hour same-user/amount refund match only for historical purchases without a purchase link.
- A refund credits the original purchase price and links the refund transaction to the virtual number for exactly-once recovery.

## Admin endpoints
- `GET /admin/fivesim/pending-refunds` — list numbers awaiting refund
- `POST /admin/fivesim/trigger-refund-sweep` — manual trigger (used from diagnostics page)

## Frontend
- `PendingRefundsPanel` component added to `/admin/diagnostics` — shows count, list, and manual sweep button
- At local `00:00`, activation UI may wait for 5sim's final status; it must not claim a refund until the terminal result is processed.

**Why:** The user chose 5sim's terminal status as the source of truth and removed paid extensions; provider completion may differ from the local timer. Exact purchase links prevent unrelated equal-value refunds from suppressing a new refund.

**How to apply:** For activation orders with a provider ID, finalize on 5sim `TIMEOUT` (or definitive not-found), not merely on local time. Keep the local-expiry fallback for hosting and records with no provider order.
