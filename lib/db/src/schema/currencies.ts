import {
  pgTable,
  serial,
  varchar,
  boolean,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";

export const currenciesTable = pgTable("currencies", {
  id:           serial("id").primaryKey(),
  countryCode:  varchar("country_code", { length: 10 }).notNull(),
  currencyCode: varchar("currency_code", { length: 10 }).notNull(),
  currencyName: varchar("currency_name", { length: 50 }).notNull(),
  realRate:     numeric("real_rate",   { precision: 18, scale: 6 }).notNull().default("1"),
  clientRate:   numeric("client_rate", { precision: 18, scale: 6 }).notNull().default("1"),
  active:       boolean("active").notNull().default(true),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Currency    = typeof currenciesTable.$inferSelect;
export type InsertCurrency = typeof currenciesTable.$inferInsert;
