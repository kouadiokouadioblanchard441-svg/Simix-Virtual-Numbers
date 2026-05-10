import { pgTable, text, boolean, integer, timestamp, uuid } from "drizzle-orm/pg-core";

export const bannersTable = pgTable("banners", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  imageData: text("image_data"),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  bgFrom: text("bg_from").notNull().default("#7C3AED"),
  bgTo: text("bg_to").notNull().default("#4C1D95"),
  textColor: text("text_color").notNull().default("#FFFFFF"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Banner = typeof bannersTable.$inferSelect;
export type NewBanner = typeof bannersTable.$inferInsert;
