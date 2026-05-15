import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const transactionsTable = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("completed"),
  method: text("method"),
  description: text("description"),
  externalDepositId: text("external_deposit_id"),
  /**
   * Gateway-specific metadata stored as JSON string.
   * For Clapay: { clapaySignature, clapayCurrency, clapayCountry }
   * For PawaPay: { provider, currency }
   */
  gatewayMeta: text("gateway_meta"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;
