import {
  pgTable,
  text,
  uuid,
  integer,
  unique,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Stores per-service per-country availability fetched from 5sim.
 * Populated automatically by the 5sim sync — never by admin.
 * Admin configurations (service_prices) are separate and untouched.
 */
export const serviceCountryAvailabilityTable = pgTable(
  "service_country_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceSlug: text("service_slug").notNull(),
    countryCode: text("country_code").notNull(),
    available: integer("available").notNull().default(0),
    providerPriceFcfa: integer("provider_price_fcfa").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("sca_service_country_unique").on(t.serviceSlug, t.countryCode),
  ],
);

export type ServiceCountryAvailability = typeof serviceCountryAvailabilityTable.$inferSelect;
export type InsertServiceCountryAvailability = typeof serviceCountryAvailabilityTable.$inferInsert;
