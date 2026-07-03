---
name: Seed idempotency rules
description: Which fields seed functions may update on conflict vs which belong to admin
---

## Rule

Seed functions (both `scripts/src/seed.ts` and server-startup seeds like `seed-payment-methods.ts`) must **never overwrite admin-owned fields** on conflict.

**Admin-owned fields — always use `onConflictDoNothing` or exclude from `set`:**
- `services`: `price`, `popular`, `sortOrder`, `margin`, `adminPriceModified`, `enabled`
- `countries`: `price`, `popular`, `sortOrder`, `enabled`, `numbersEnabled`, `adminPriceModified`
- `payment_methods`: `recommended`, `sortOrder`, `color`
- `system_settings`: ALL values (admin may have changed any setting)

**Technical fields — safe to update on conflict:**
- `services`: `name`, `color`, `category`
- `countries`: `name`, `dialCode`, `flag`, `available`
- `payment_methods`: `name`, `description` (stable, not admin-configured)

**Why:** Re-running `pnpm seed` or restarting the server must not reset admin configurations. Before this was fixed, `upsertSystemSettings` used `onConflictDoUpdate { set: { value } }` which reset all settings (telegram tokens, pawapay tokens, maintenance mode, etc.) on every seed. Similarly, `upsertServices` and `upsertCountries` overwrote `price`, `popular`, `sortOrder`.

**How to apply:** When writing or editing any seed/upsert function, check each field in the `set` clause — if an admin can configure it via the admin panel, it must NOT be in the `set` clause.
