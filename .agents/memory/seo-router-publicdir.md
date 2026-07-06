---
name: SEO router publicDir resolution
description: How seo.ts must resolve the public directory to find manifest/static files at runtime from dist/.
---

## Rule
Any route in `seo.ts` (or other routes compiled into `dist/`) that reads files from the frontend `public/` directory must use the same two-step publicDir resolution as `app.ts`:

```typescript
const currentDir = (globalThis as { __dirname?: string }).__dirname ?? __dirname;
const publicDir = existsSync(path.join(currentDir, "public"))
  ? path.join(currentDir, "public")
  : path.join(currentDir, "..", "public");
```

**Why:** The compiled bundle runs from `dist/index.cjs` (`__dirname` = `/workspace/dist`). `dist/public/` does not exist — the frontend is at `/workspace/public/`. A naive `path.join(currentDir, "public", "manifest.webmanifest")` resolves to `dist/public/manifest.webmanifest` which doesn't exist → 404 "manifest not found" (18 bytes).

The `/manifest.webmanifest` route was returning 404 because of this exact bug; `manifest.json` was working only because it happened to be served by `express.static` before the route was reached.

**How to apply:** Whenever a route handler (not middleware) reads from the public dir in `dist/`, copy the two-step pattern above. Do not hardcode `../public` alone; the `existsSync` check makes it work in both dev (source run) and production (dist run) layouts.
