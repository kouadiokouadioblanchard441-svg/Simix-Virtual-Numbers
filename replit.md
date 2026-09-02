# Simix

Mobile-first French-language fintech web app for buying virtual phone numbers and receiving SMS verification codes, paid via mobile money (Orange / MTN) in FCFA.

## Architecture

Monorepo (pnpm workspaces) with the following workspace pieces:

- `artifacts/simix` — React + Vite frontend (mobile-first, dark + violet theme, French UI). Bound to preview path `/`.
- `artifacts/api-server` — Express 5 + Node API. Implements the OpenAPI contract.
- `lib/api-spec/openapi.yaml` — Single source of truth for all HTTP endpoints.
- `lib/api-zod/src/generated/api.ts` — Zod schemas generated from the OpenAPI spec (used for request/response validation on the server).
- `lib/api-client-react/src/generated/api.ts` — React Query hooks generated from the OpenAPI spec (used by the frontend).
- `lib/db` — Drizzle ORM schema + Postgres client.
- `scripts/src/seed.ts` — Seeds reference data (services, countries, payment methods).

## Domain model

- `users` — fullName, phone (unique), countryCode, passwordHash, balance (in FCFA, integer), verified, status.
- `services` — WhatsApp, Telegram, Facebook, Google, Instagram, Twitter/X, TikTok, Snapchat, Discord, Signal, Apple, Microsoft.
- `countries` — 20 countries (US, UK, FR, CA, CI, DE, NL, SE, BE, ES, IT, SN, ML, BF, MA, IN, BR, MX, AU, JP) with dial codes, flags, prices and availability.
- `payment_methods` — Mobile Money (recommended), Carte bancaire, Transfert bancaire, Orange Money, MTN Money.
- `virtual_numbers` — Owned by a user, scoped to a service+country, with status (waiting/received/cancelled/expired), price, expiresAt.
- `sms_messages` — SMS messages received on a virtual number.
- `transactions` — recharge / purchase / refund history.
- `sessions` — Server-side session store. The session id is set as an `httpOnly` cookie `simix_session`.

## Auth

- Local auth with `bcryptjs` for password hashing and a server-side session store backed by Postgres.
- `attachUser` middleware reads the `simix_session` cookie and attaches `req.user` if valid.
- `requireAuth` middleware gates protected routes.
- The frontend uses session cookies on same-origin requests — no token getter is registered.

## Mock SMS provider

`artifacts/api-server/src/lib/sms-simulator.ts` schedules a synthetic verification SMS to be inserted 8–20s after a number is requested. In production this is the seam where a real provider (PawaPay / SMS-Activate / etc.) would plug in.

## Database

The app connects to the user's own Supabase Postgres via the `SUPABASE_DATABASE_URL` secret (checked before the Replit-managed `DATABASE_URL` in `lib/db/src/index.ts`, `lib/db/drizzle.config.ts`, and `scripts/src/seed.ts`). This is the only database used by the project — the Replit-provisioned Postgres remains bound but is not read by the app.

## Development

```bash
# Install all workspace dependencies
pnpm install --frozen-lockfile

# Start the Replit preview server on port 5000
bash start-replit.sh

# Push schema changes
pnpm --filter @workspace/db run push

# Seed reference data + demo user
pnpm --filter @workspace/scripts run seed

# Regenerate API client + Zod schemas after editing openapi.yaml
pnpm --filter @workspace/api-spec run codegen
```

Workflows are managed by Replit and serve the artifacts on a single shared proxy.

## Replit setup

The `Start application` workflow runs `bash start-replit.sh` and serves the combined
API and frontend preview on port 5000. Configure these values in Replit Secrets:

- `SUPABASE_DATABASE_URL` — the PostgreSQL connection URL for the Supabase database.
- `SESSION_SECRET` — the server session signing secret.
- `ADMIN_JWT_SECRET` — the admin session signing secret.

The Supabase database is migrated automatically when the server starts. Optional
providers such as 5sim, mobile money, transactional email, and Google OAuth can be
configured later without changing the Replit startup workflow.
