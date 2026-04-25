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
  phone: text("phone").notNull().unique(),
  email: text("email").notNull(),
  countryCode: text("country_code").notNull().default("+225"),
  passwordHash: text("password_hash").notNull(),
  balance: integer("balance").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  status: text("status").notNull().default("Standard"),
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
