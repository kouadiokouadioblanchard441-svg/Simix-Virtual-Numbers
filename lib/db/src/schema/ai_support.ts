import { pgTable, text, uuid, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const aiKnowledgeBaseTable = pgTable("ai_knowledge_base", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull().default("general"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const aiSupportConfigTable = pgTable("ai_support_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  label: text("label").notNull().default(""),
  group: text("group").notNull().default("general"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiKnowledgeEntry = typeof aiKnowledgeBaseTable.$inferSelect;
export type AiSupportConfig = typeof aiSupportConfigTable.$inferSelect;
