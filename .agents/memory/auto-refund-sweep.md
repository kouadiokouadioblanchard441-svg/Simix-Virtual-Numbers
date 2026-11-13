---
name: Auto-refund bug and sweep
description: Rules for atomic, exactly-once refunds after real number expiry, including activation and hosting safeguards.
---

## The bug
Provider terminal statuses can arrive before the Simix expiry after a paid extension. Expiry/refund decisions must therefore use the current persisted `expiresAt`, not the provider response or a creation-age fallback.

## Expiry-based auto-refund
- The persisted Simix expiry is authoritative, including paid extensions.
- A provider `TIMEOUT` before that deadline leaves the number waiting; the sweep refunds only after the current deadline and only if no SMS is stored.
- Terminal provider responses must save any included SMS before refund handling.
- The worker checks expired numbers every minute and runs a sweep at startup.
- SMS persistence and refund decisions lock the virtual-number row, preventing a race from crediting a number whose SMS was saved at the same time.
- A refund credits the original purchase price and links the refund transaction to the virtual number for exactly-once recovery.

## Admin endpoints
- `GET /admin/fivesim/pending-refunds` — list numbers awaiting refund
- `POST /admin/fivesim/trigger-refund-sweep` — manual trigger (used from diagnostics page)

## Frontend
- `PendingRefundsPanel` component added to `/admin/diagnostics` — shows count, list, and manual sweep button
- User-facing text must promise refund at the displayed expiry, not at a hard-coded duration

**Why:** The provider can time out independently of the app's extended deadline, and SMS arrival can race an expiry sweep. The local deadline and row lock keep refund decisions aligned with what the user was shown.
