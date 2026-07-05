---
name: Drizzle ORM error wrapping (node-postgres)
description: Drizzle 0.45+ wraps pg DatabaseErrors in DrizzleQueryError — raw pg error is at err.cause, not err directly.
---

# Drizzle ORM error wrapping with node-postgres

## The rule
When Drizzle 0.45+ throws an error from a failed query (e.g. unique constraint violation), the raw `pg.DatabaseError` is **not** at the top level — it's wrapped in a `DrizzleQueryError`. The pg error is accessible at `err.cause`.

## Why
Drizzle 0.45.2 introduced `DrizzleQueryError` as a wrapper. `err.code` (e.g. `'23505'`) and `err.detail` are **undefined** on the DrizzleQueryError itself; they live on `err.cause`.

## How to apply
Always check both levels when catching Drizzle errors:

```typescript
} catch (err: unknown) {
  const pgErr = (err as any)?.cause ?? err;   // unwrap DrizzleQueryError
  const pgCode: string = pgErr?.code ?? "";
  const pgDetail: string = pgErr?.detail ?? "";
  if (pgCode === "23505") { /* unique violation */ }
}
```

Do NOT do:
```typescript
const pgCode = (err as { code?: string })?.code;  // WRONG — undefined for Drizzle errors
```

## Verified with
- drizzle-orm@0.45.2 + pg@8.20.0 (node-postgres driver)
- `DatabaseError` constructor name appears at `err.cause.constructor.name`
- Direct `pool.query()` calls still throw raw `DatabaseError` (no wrapping)
