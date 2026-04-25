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
  popular: boolean("popular").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
});

export type Country = typeof countriesTable.$inferSelect;
export type InsertCountry = typeof countriesTable.$inferInsert;
