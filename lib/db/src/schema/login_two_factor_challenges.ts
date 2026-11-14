import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginTwoFactorChallengesTable = pgTable(
  "login_two_factor_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_login_two_factor_challenges_user_created")
      .on(table.userId, table.createdAt),
    index("idx_login_two_factor_challenges_expires")
      .on(table.expiresAt),
  ],
);

export type LoginTwoFactorChallenge = typeof loginTwoFactorChallengesTable.$inferSelect;
export type InsertLoginTwoFactorChallenge = typeof loginTwoFactorChallengesTable.$inferInsert;
