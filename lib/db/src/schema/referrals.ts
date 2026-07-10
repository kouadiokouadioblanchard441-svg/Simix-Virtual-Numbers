import { pgTable, uuid, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralCommissionsTable = pgTable("referral_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  refereeId: uuid("referee_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  purchaseAmount: integer("purchase_amount").notNull(),
  commissionAmount: integer("commission_amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReferralCommission = typeof referralCommissionsTable.$inferSelect;

/* ── Referral withdrawal requests ──────────────────────────────────
   A user requests to withdraw their referral bonus balance to a mobile
   money number. The requested amount is reserved (deducted from
   users.referral_balance) immediately on request; an admin then
   approves (paid) or rejects (refunded back to the balance) it. ── */
export const referralWithdrawalsTable = pgTable("referral_withdrawals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  countryCode: text("country_code").notNull(),
  operatorSlug: text("operator_slug").notNull(),
  phone: text("phone").notNull(),
  /** pending | paid | rejected */
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  processedBy: text("processed_by"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReferralWithdrawal = typeof referralWithdrawalsTable.$inferSelect;
export type InsertReferralWithdrawal = typeof referralWithdrawalsTable.$inferInsert;
