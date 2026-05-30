---
name: Admin router global middleware trap
description: routes/admin.ts uses router.use(requireAdminJwt) without a path, which intercepts ALL requests passing through the admin router — not just /admin/* routes.
---

## Rule
Never place new user-facing routers AFTER `router.use(adminRouter)` in `routes/index.ts`.

**Why:** `admin.ts` starts with `router.use(requireAdminJwt)` (no path), meaning every request that enters the admin router sub-pipeline hits that JWT check first. Since the admin router is mounted without a path prefix (`router.use(adminRouter)`), Express will pass ALL unmatched requests through it — and they'll all fail with "Admin session required."

**How to apply:** Always insert new non-admin routers BEFORE `router.use(adminRouter)` in `artifacts/api-server/src/routes/index.ts`.
