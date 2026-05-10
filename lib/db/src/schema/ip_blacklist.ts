import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const ipBlacklistTable = pgTable("ip_blacklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // "ip" | "phone" | "userId" | "email"
  value: text("value").notNull(),
  reason: text("reason").notNull().default("Banni manuellement"),
  bannedBy: text("banned_by"),
  permanent: boolean("permanent").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IpBlacklist = typeof ipBlacklistTable.$inferSelect;
export type InsertIpBlacklist = typeof ipBlacklistTable.$inferInsert;
