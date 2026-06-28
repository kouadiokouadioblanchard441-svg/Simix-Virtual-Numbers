import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  unique,
  timestamp,
} from "drizzle-orm/pg-core";

export const servicePricesTable = pgTable(
  "service_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryCode: text("country_code").notNull(),
    serviceSlug: text("service_slug").notNull(),
    price: integer("price").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * Set to TRUE by admin price-update endpoints.
     * When TRUE, the sync scheduler NEVER overwrites `price`.
     * When FALSE (default for sync-created entries), sync may update price
     * based on the latest 5sim provider cost.
     */
    adminModified: boolean("admin_modified").notNull().default(false),
  },
  (t) => [unique("service_prices_country_service_unique").on(t.countryCode, t.serviceSlug)],
);

export type ServicePrice = typeof servicePricesTable.$inferSelect;
export type InsertServicePrice = typeof servicePricesTable.$inferInsert;
