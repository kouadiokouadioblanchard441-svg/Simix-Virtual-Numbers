---
name: Admin country picker pattern
description: Convention for letting admins select countries in admin UI forms (e.g. operator routing, payment configs)
---

Never use a free-text comma-separated ISO-code input for admin country selection (e.g. "CI,CM,SN,GH"). It's error-prone and shows raw codes instead of names.

**Why:** A prior implementation in routing.tsx (Opérateurs section) used a free-text field for `operator.countryCodes`, making it easy to mistype/omit codes (e.g. Gabon "GA" silently missing) with no visual feedback.

**How to apply:** Build a searchable button/checkbox list sourced from `GET /admin/countries` (returns `{code, name, flag}` from the `countries` table), toggle-to-select with removable chips for selected items. Reference implementations: `DepositCountriesTab` in `artifacts/simix/src/pages/admin/payment-config.tsx`, and `CountryMultiSelect` in `artifacts/simix/src/pages/admin/routing.tsx`. Also render chips/badges with flag+name (via a code→country lookup map), never the raw code alone.
