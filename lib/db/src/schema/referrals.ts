import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
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
