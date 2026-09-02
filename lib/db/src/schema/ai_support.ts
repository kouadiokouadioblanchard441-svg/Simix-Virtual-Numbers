import { pgTable, text, uuid, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";

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

/** Encrypted credentials used by Simia's automatic OpenAI/Anthropic failover. */
export const aiProviderTokensTable = pgTable("ai_provider_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: text("masked_key").notNull(),
  model: text("model").notNull(),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  status: text("status").notNull().default("unknown"),
  creditAmount: numeric("credit_amount", { precision: 14, scale: 4 }),
  creditCurrency: text("credit_currency"),
  rateLimitRequestsRemaining: integer("rate_limit_requests_remaining"),
  rateLimitTokensRemaining: integer("rate_limit_tokens_remaining"),
  rateLimitReset: timestamp("rate_limit_reset", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiKnowledgeEntry = typeof aiKnowledgeBaseTable.$inferSelect;
export type AiSupportConfig = typeof aiSupportConfigTable.$inferSelect;
export type AiProviderToken = typeof aiProviderTokensTable.$inferSelect;
