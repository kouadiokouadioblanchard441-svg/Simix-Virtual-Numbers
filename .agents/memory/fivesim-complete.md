---
name: 5sim API complete integration
description: All 5sim API endpoints are now implemented; key architectural decisions for hosting vs activation numbers.
---

## Rule
The 5sim client (`fivesim.ts`) now covers all 19 documented endpoints. The poller (`fivesim-poller.ts`) routes activation vs hosting numbers to different poll methods.

**Hosting numbers (1day / 3hours):**
- Buy via `buyHostingNumber(country, operator, product)` where product = "1day" | "3hours"
- Poll via `getSmsInbox(orderId)` — NOT `checkOrder()`
- Can receive multiple SMS; do NOT mark as "received" after first SMS
- Stay active until `expiresAt` (set from `order.expires` returned by 5sim)
- DB columns: `number_type = 'hosting'`, `hosting_duration = '1day' | '3hours'`

**Activation numbers (one-shot):**
- Buy via `buyNumber(country, operator, product)` — unchanged
- Poll via `checkOrder(orderId)` — unchanged
- Mark as "received" after first SMS, call `finishOrder`
- DB column: `number_type = 'activation'` (default)

**Admin 5sim endpoints** (`/admin/fivesim/*`):
- All protected by `requireAdminJwt`
- Route: `artifacts/api-server/src/routes/admin-fivesim.ts`
- Covers: profile, statistic, wallets, orders, payments, flash, prices, user/orders, user/payments

**DB migration applied directly via SQL** (drizzle-kit push was interactive):
```sql
ALTER TABLE virtual_numbers ADD COLUMN IF NOT EXISTS number_type text NOT NULL DEFAULT 'activation';
ALTER TABLE virtual_numbers ADD COLUMN IF NOT EXISTS hosting_duration text;
```

**Why:**
5sim has two distinct product categories: one-shot activations (20 min) and long-term rentals (hosting). They use different APIs and different polling strategies. The poller branches on `vn.numberType` to pick the right strategy.

**How to apply:**
When adding new number purchase flows, always check `numberType` and use the correct 5sim endpoint. Never use `checkOrder` for hosting numbers — it will return incorrect data.
