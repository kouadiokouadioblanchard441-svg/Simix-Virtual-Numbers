import { pgTable, text, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const adminLogsTable = pgTable("admin_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminLog = typeof adminLogsTable.$inferSelect;
