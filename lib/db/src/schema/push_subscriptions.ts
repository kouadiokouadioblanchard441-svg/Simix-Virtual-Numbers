import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id:       uuid("id").primaryKey().defaultRandom(),
    userId:   uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh:   text("p256dh").notNull(),
    auth:     text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptionsTable.$inferInsert;
