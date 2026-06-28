import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const countriesTable = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  dialCode: text("dial_code").notNull(),
  flag: text("flag").notNull(),
  available: integer("available").notNull().default(0),
  price: integer("price").notNull(),
  /**
   * Set to TRUE by admin price-update endpoints.
   * When TRUE, the sync scheduler NEVER overwrites `price`.
   * When FALSE (default), the price may be updated during sync.
   */
  adminPriceModified: boolean("admin_price_modified").notNull().default(false),
  popular: boolean("popular").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
  /** When false: country is hidden from registration picker + deposits are blocked */
  enabled: boolean("enabled").notNull().default(true),
  /** When false: country is hidden from the virtual numbers (5sim) picker */
  numbersEnabled: boolean("numbers_enabled").notNull().default(true),
});

export type Country = typeof countriesTable.$inferSelect;
export type InsertCountry = typeof countriesTable.$inferInsert;
