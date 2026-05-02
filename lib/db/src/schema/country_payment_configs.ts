import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

export const countryPaymentConfigsTable = pgTable("country_payment_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: text("country_code").notNull(),
  methodSlug: text("method_slug").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  minDeposit: integer("min_deposit").notNull().default(500),
  feePercent: integer("fee_percent").notNull().default(0),
}, (t) => ({
  uniq: unique().on(t.countryCode, t.methodSlug),
}));

export type CountryPaymentConfig = typeof countryPaymentConfigsTable.$inferSelect;
export type InsertCountryPaymentConfig = typeof countryPaymentConfigsTable.$inferInsert;
