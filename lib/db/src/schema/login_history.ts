import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginHistoryTable = pgTable("login_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  ip: text("ip"),
  country: text("country"),
  city: text("city"),
  region: text("region"),
  isp: text("isp"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"),
  success: text("success").notNull().default("true"),
  failReason: text("fail_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LoginHistory = typeof loginHistoryTable.$inferSelect;
export type InsertLoginHistory = typeof loginHistoryTable.$inferInsert;
