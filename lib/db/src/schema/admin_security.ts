import { pgTable, text, uuid, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const adminAccessLogsTable = pgTable("admin_access_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ip: text("ip").notNull(),
  email: text("email"),
  action: text("action").notNull(),
  success: boolean("success").notNull().default(false),
  userAgent: text("user_agent"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminAccessLog = typeof adminAccessLogsTable.$inferSelect;
