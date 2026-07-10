---
name: Migration source of truth
description: Which migrations directory is actually used by drizzle-kit and the build/runtime, vs. a stale duplicate.
---

The real migration source is `lib/db/drizzle/` (SQL files + `meta/_journal.json`) — this is what `drizzle-kit` writes to (config has no explicit `out`, defaults to `./drizzle` relative to `lib/db/drizzle.config.ts`).

**Why:** `artifacts/api-server/build.mjs` copies `lib/db/drizzle` → `dist/migrations`, and the running server's `migrate()` call reads `dist/migrations` at startup. The root-level `migrations/` directory is a duplicate that is NOT read by the build or runtime — it appears to be manually kept in sync (imperfectly; a migration file existed there without a matching journal entry).

**How to apply:** when hand-writing a new migration SQL file, add it to `lib/db/drizzle/<NNNN>_name.sql` AND append the matching entry to `lib/db/drizzle/meta/_journal.json` (idx/version/tag/breakpoints) — the journal entry is required for `migrate()` to pick it up. Mirror both files into the root `migrations/` copy for consistency, but treat `lib/db/drizzle` as authoritative. After adding, force a fresh backend build (`rm dist/index.cjs && node artifacts/api-server/build.mjs`) since `start-replit.sh` skips rebuilding if `dist/index.cjs` already exists.
