import { pgTable, text, uuid, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const supportConversationsTable = pgTable("support_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id").notNull().unique(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  language: text("language").notNull().default("fr"),
  status: text("status").notNull().default("active"),
  userName: text("user_name"),
  userEmail: text("user_email"),
  isHumanTakeover: boolean("is_human_takeover").notNull().default(false),
  agentNote: text("agent_note"),
  priority: text("priority").notNull().default("normal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supportMessagesTable = pgTable("support_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => supportConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  imageData: text("image_data"),
  metadata: jsonb("metadata"),
  sentByAdmin: boolean("sent_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportConversation = typeof supportConversationsTable.$inferSelect;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;
