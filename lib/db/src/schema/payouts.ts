import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { referralWithdrawalsTable } from "./referrals";

/**
 * Durable record of every merchant-initiated payout. Provider identifiers are
 * assigned before any outbound request so ambiguous network failures can be
 * reconciled without creating a second transfer.
 */
export const payoutsTable = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  gateway: text("gateway").notNull(),
  externalId: text("external_id").notNull(),
  signature: text("signature"),
  gatewayConfigId: uuid("gateway_config_id"),
  referralWithdrawalId: uuid("referral_withdrawal_id")
    .references(() => referralWithdrawalsTable.id, { onDelete: "set null" }),
  actorId: text("actor_id").notNull(),
  phone: text("phone").notNull(),
  provider: text("provider").notNull(),
  country: text("country").notNull(),
  currency: text("currency").notNull(),
  amount: numeric("amount", { precision: 20, scale: 3 }).notNull(),
  status: text("status").notNull().default("pending"),
  failureReason: text("failure_reason"),
  initiationClaimedAt: timestamp("initiation_claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("payouts_idempotency_key_uidx").on(table.idempotencyKey),
  uniqueIndex("payouts_referral_withdrawal_uidx").on(table.referralWithdrawalId),
  uniqueIndex("payouts_external_id_uidx").on(table.gateway, table.externalId),
  index("payouts_status_created_idx").on(table.status, table.createdAt),
]);

export type Payout = typeof payoutsTable.$inferSelect;
export type InsertPayout = typeof payoutsTable.$inferInsert;