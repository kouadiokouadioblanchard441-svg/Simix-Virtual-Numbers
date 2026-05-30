---
name: Services table filtering
description: How to distinguish curated main services from 5sim-synced products in the services table.
---

## Rule
Filter user-facing services with `sort_order <= 180` (Drizzle: `lte(servicesTable.sortOrder, 180)`).

**Why:** The 5sim sync upserts ALL its products into the `services` table, setting `sort_order = 200` for every synced entry. The 18 curated main services use sort_order 10, 20, 30, ..., 180. Without this filter, `GET /services` returns 1111+ services instead of 18.

**How to apply:** Any endpoint or query that should show only main services must include `lte(servicesTable.sortOrder, 180)` in the WHERE clause. Also combine with `eq(servicesTable.enabled, true)`.
