---
name: Plesk deployment architecture
description: How this project (Simix) deploys to Plesk hosting outside Replit — entry points, static serving, and graceful degradation of Replit-only features.
---

## Entry point
- `package.json` "start" script runs `node startup.js`, NOT directly `node dist/index.cjs`.
- `startup.js` self-builds on demand: checks required env vars (DATABASE_URL/SUPABASE_DATABASE_URL, SESSION_SECRET, ADMIN_JWT_SECRET), compares source dirs' mtimes against `dist/index.cjs`, and runs `pnpm install` + `node artifacts/api-server/build.mjs` + `vite build` automatically if stale. Falls back to a diagnostic HTML page on port PORT if config/build fails, instead of crashing silently.
- `server.js` (`require('./dist/index.cjs')`) and `ecosystem.config.js` (pm2) are alternate/legacy entry points — `startup.js` is the one wired to `npm start`.

**Why:** Two deployment docs exist (DEPLOIEMENT.md/DEPLOY.md) describing an older "prebuild dist/ then git push, Plesk just runs node dist/index.cjs, no build on server" workflow. startup.js supersedes that with self-building — both are compatible since it skips rebuilding when the bundle is already fresh, but don't assume Plesk needs a manual prebuild step; it doesn't.

## Static frontend serving
- Vite outDir is configured to the **root-level `public/`** directory (not `dist/public`). `DEPLOY.md`'s "Document Root: dist/public" is stale/incorrect — the actual runtime (`app.ts`) resolves `publicDir` with a dual fallback (`currentDir/public` → `currentDir/../public`) and finds root `public/` correctly regardless of cwd.
- Plesk/nginx can serve the public HTML before the Node/Express middleware. After changing HTTP security headers, verify the actual `https://www.simix.site/` response; if Express headers are absent, deploy the new bundle and configure equivalent `add_header ... always` directives in Plesk nginx.

**Why:** Local Express responses can be fully protected while the public Plesk response still exposes only nginx/Plesk headers, so code-level validation alone is insufficient.

**How to apply:** Check the final response after redirects on both apex and `www`. Confirm HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, and Permissions-Policy at the public edge.

## Replit-only features degrade gracefully
- `lib/objectStorage.ts` depends on the Replit sidecar (`127.0.0.1:1106`) for GCS-backed uploads — this will fail outside Replit. `routes/storage.ts` already has a working fallback: `POST /storage/uploads/request-url` returns 503 with `fallback: "/api/storage/uploads/direct"`, and the frontend (`image-upload-button.tsx`) already calls that direct-upload endpoint. So file uploads keep working on Plesk via local disk (`UPLOAD_DIR` env var), just without GCS.
- `REPLIT_DEV_DOMAIN` / `REPLIT_DOMAINS` appear in `google-auth.ts`, `crypto-wallet.ts`, `admin.ts`, `app.ts` CORS/CSP — all are dev-only fallbacks behind an explicit-env-var-wins check (`GOOGLE_REDIRECT_URI`, `APP_URL`, `nowpayments_webhook_url` setting). Not a blocker in production as long as those are set.
- Database, sessions, and the multi-provider email router (see email-router-infra.md) have zero Replit-specific dependencies — fully portable as-is.

## Email credentials and workers
- Production email credentials may live only in Plesk environment variables. The Plesk process must bootstrap a missing or undecryptable Resend database credential from `RESEND_API_KEY` before electing the worker leader.
- Replit deliberately does not start email workers when `REPL_ID` or `REPLIT_DEV_DOMAIN` is present, even when it shares the production Supabase database.

**Why:** A provider row can remain active while its encrypted key is absent; campaigns then enter the persistent queue but every attempt fails locally with `apiKey manquante`. Running Replit workers would risk duplicate real emails alongside Plesk.

**How to apply:** After deploying email bootstrap or worker changes, restart the Plesk Node.js application. Confirm the bootstrap log, then let the elected Plesk worker process eligible pending campaign messages; do not enable Replit workers as a workaround.
