---
name: Payment credential browser storage
description: Rules for handling temporary payment codes and provider checkout links in the browser.
---

Never persist operator payment OTPs or provider payment URLs in `localStorage` or `sessionStorage`. Keep them in component memory and rehydrate through the authenticated deposit-status endpoint when possible.

**Why:** Browser storage is readable by same-origin scripts and can retain bearer-like payment values beyond the visible checkout flow.

**How to apply:** When a checkout must survive navigation or reload, persist only non-secret metadata and fetch the actionable payment fields again from an endpoint that verifies the authenticated owner.
