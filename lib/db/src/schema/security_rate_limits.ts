import { index, pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

export const securityRateLimitsTable = pgTable(
  "security_rate_limits",
  {
    keyHash: text("key_hash").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    hitCount: integer("hit_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_security_rate_limits_updated_at").on(table.updatedAt),
  ],
);

export type SecurityRateLimit = typeof securityRateLimitsTable.$inferSelect;
