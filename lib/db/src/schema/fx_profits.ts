import {
  pgTable,
  serial,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { transactionsTable } from "./transactions";

export const fxProfitsTable = pgTable("fx_profits", {
  id:            serial("id").primaryKey(),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  currency:      varchar("currency", { length: 10 }).notNull(),
  localAmount:   numeric("local_amount", { precision: 18, scale: 2 }).notNull(),
  realRate:      numeric("real_rate",    { precision: 18, scale: 6 }).notNull(),
  clientRate:    numeric("client_rate",  { precision: 18, scale: 6 }).notNull(),
  amountXof:     numeric("amount_xof",  { precision: 18, scale: 2 }).notNull(),
  profitXof:     numeric("profit_xof",  { precision: 18, scale: 2 }).notNull(),
  status:        text("status").notNull().default("completed"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FxProfit       = typeof fxProfitsTable.$inferSelect;
export type InsertFxProfit = typeof fxProfitsTable.$inferInsert;
