import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const accountSecurityTable = pgTable("account_security", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  pinHash: text("pin_hash"),
  pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountSecurity = typeof accountSecurityTable.$inferSelect;
export type InsertAccountSecurity = typeof accountSecurityTable.$inferInsert;
