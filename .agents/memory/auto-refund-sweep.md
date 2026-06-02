---
name: Auto-refund bug and sweep
description: handleExpiredOrder had a bug (no refund on TIMEOUT); fixed + 30-min auto-refund sweep added.
---

## The bug
`handleExpiredOrder` (called when 5sim returns TIMEOUT or order not found) marked the number as "expired" but **never issued a refund**. The notification even falsely said "un remboursement sera effectué". Only `handleCancelledOrder` issued refunds.

**Fix:** `handleExpiredOrder` now checks SMS count and refunds if 0, exactly like `handleCancelledOrder`.

## 30-minute auto-refund sweep
Added `triggerAutoRefundSweep()` exported from `fivesim-poller.ts`:
- Runs automatically every 5 min via `scheduleSweep(SWEEP_INTERVAL_MS)`
- Finds all `virtual_numbers` with `status='waiting'` AND `created_at < NOW() - 30min` AND `external_order_id IS NOT NULL`
- For each: checks SMS count; if 0 → tries to cancel on 5sim (best-effort) → marks `cancelled` → refunds balance → sends notification
- Uses optimistic locking: `.returning()` after UPDATE to skip if already processed

## Admin endpoints
- `GET /admin/fivesim/pending-refunds` — list numbers awaiting refund
- `POST /admin/fivesim/trigger-refund-sweep` — manual trigger (used from diagnostics page)

## Frontend
- `PendingRefundsPanel` component added to `/admin/diagnostics` — shows count, list, and manual sweep button
- "Garantie remboursement 30 min" badge added to `number-details.tsx` (purchase page)

**Why:** The TIMEOUT path was a dead-end — 5sim sends TIMEOUT when the window closes without SMS, which is the most common no-SMS case. Not refunding on TIMEOUT was a real money-retention bug.
