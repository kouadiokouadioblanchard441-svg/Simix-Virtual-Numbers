---
name: Auto-refund bug and sweep
description: Rules for atomic, exactly-once refunds after real number expiry, including activation and hosting safeguards.
---

## The bug
`handleExpiredOrder` (called when 5sim returns TIMEOUT or order not found) marked the number as "expired" but **never issued a refund**. The notification even falsely said "un remboursement sera effectué". Only `handleCancelledOrder` issued refunds.

**Fix:** `handleExpiredOrder` now checks SMS count and refunds if 0, exactly like `handleCancelledOrder`.

## Expiry-based auto-refund sweep
Added `triggerAutoRefundSweep()` exported from `fivesim-poller.ts`:
- Runs automatically every 5 min via `scheduleSweep(SWEEP_INTERVAL_MS)`
- Finds waiting numbers after their real `expiresAt`; activation numbers also have a 30-minute age fallback for malformed provider expiry dates
- Hosting numbers (3 h/24 h) never use the 30-minute fallback; they remain active until their real expiry
- For each: checks SMS count; if 0 → tries to cancel on 5sim (best-effort) → marks `cancelled` → refunds balance → sends notification
- Uses optimistic locking: `.returning()` after UPDATE to skip if already processed
- New refund transactions link directly to their virtual number; a unique database index prevents a second refund for the same number

## Admin endpoints
- `GET /admin/fivesim/pending-refunds` — list numbers awaiting refund
- `POST /admin/fivesim/trigger-refund-sweep` — manual trigger (used from diagnostics page)

## Frontend
- `PendingRefundsPanel` component added to `/admin/diagnostics` — shows count, list, and manual sweep button
- User-facing text must promise refund at the displayed expiry, not at a hard-coded duration

**Why:** The TIMEOUT path was a dead-end, and a creation-age-only sweep both delayed activation refunds after visible expiry and could cancel 3 h/24 h hosting rentals too early. Exact transaction linkage replaces unreliable amount/time matching.
