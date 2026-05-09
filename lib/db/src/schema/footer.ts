import { pgTable, text, uuid, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const socialLinksTable = pgTable("social_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  color: text("color").default("#8B5CF6"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentOperatorsTable = pgTable("payment_operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  logoData: text("logo_data"),
  websiteUrl: text("website_url"),
  countries: text("countries"),
  bgColor: text("bg_color").default("#1a1a2e"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SocialLink = typeof socialLinksTable.$inferSelect;
export type PaymentOperator = typeof paymentOperatorsTable.$inferSelect;
