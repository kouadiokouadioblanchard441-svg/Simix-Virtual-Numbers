import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { virtualNumbersTable } from "./numbers";

export const transactionsTable = pgTable(
  "transactions",
  {
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
    virtualNumberId: uuid("virtual_number_id")
      .references(() => virtualNumbersTable.id, { onDelete: "set null" }),
    /**
     * Gateway-specific metadata stored as JSON string.
     * For Clapay: { clapaySignature, clapayCurrency, clapayCountry }
     * For PawaPay: { provider, currency }
     */
    gatewayMeta: text("gateway_meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /* Support for "list transactions for a user" (wallet history, very frequent) */
    index("idx_transactions_user_id").on(t.userId),
    /* Support for filtering by status (pending / completed / failed) */
    index("idx_transactions_status").on(t.status),
    /* Deduplication check — prevent double-crediting same external deposit */
    index("idx_transactions_external_deposit_id").on(t.externalDepositId),
    /* Exactly one refund may be linked to a virtual number. PostgreSQL allows
       multiple NULL values, so unrelated transactions are unaffected. */
    uniqueIndex("idx_transactions_refund_virtual_number_unique").on(t.virtualNumberId),
    /* Support for admin / reconciliation queries ordered by date */
    index("idx_transactions_created_at").on(t.createdAt),
  ],
);

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;
