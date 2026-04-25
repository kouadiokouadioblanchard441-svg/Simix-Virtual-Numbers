import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const paymentMethodsTable = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  color: text("color").notNull().default("#7C3AED"),
  recommended: boolean("recommended").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type InsertPaymentMethod = typeof paymentMethodsTable.$inferInsert;
