import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  username: text("username").unique(),
  phone: text("phone").unique(),
  email: text("email").notNull(),
  country: text("country"),
  countryCode: text("country_code").notNull().default("+225"),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  authProvider: text("auth_provider").notNull().default("local"),
  avatar: text("avatar"),
  balance: integer("balance").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  status: text("status").notNull().default("Standard"),
  blockedReason: text("blocked_reason"),
  riskScore: integer("risk_score").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  isRestricted: boolean("is_restricted").notNull().default(false),
  maxPurchasesPerMin: integer("max_purchases_per_min").notNull().default(10),
  maxBalance: integer("max_balance").notNull().default(500000),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
