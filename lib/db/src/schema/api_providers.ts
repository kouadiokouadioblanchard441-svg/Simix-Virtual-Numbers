import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const apiProvidersTable = pgTable("api_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  apiKey: text("api_key").notNull().default(""),
  baseUrl: text("base_url").notNull().default(""),
  active: boolean("active").notNull().default(false),
  priority: integer("priority").notNull().default(1),
  markup: integer("markup").notNull().default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ApiProvider = typeof apiProvidersTable.$inferSelect;
export type InsertApiProvider = typeof apiProvidersTable.$inferInsert;
