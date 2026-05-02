import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const servicesTable = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  scope: text("scope").notNull().default("Global"),
  price: integer("price").notNull(),
  providerPrice: integer("provider_price").notNull().default(0),
  margin: integer("margin").notNull().default(20),
  available: integer("available").notNull().default(1000),
  color: text("color").notNull().default("#7C3AED"),
  category: text("category").notNull().default("Messagerie"),
  popular: boolean("popular").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
});

export type Service = typeof servicesTable.$inferSelect;
export type InsertService = typeof servicesTable.$inferInsert;
