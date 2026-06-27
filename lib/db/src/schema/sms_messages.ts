import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { virtualNumbersTable } from "./numbers";

export const smsMessagesTable = pgTable(
  "sms_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numberId: uuid("number_id")
      .notNull()
      .references(() => virtualNumbersTable.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(),
    body: text("body").notNull(),
    code: text("code").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* Support for "list all SMS for a given virtual number" (very frequent, N+1 in active list) */
    index("idx_sms_messages_number_id").on(t.numberId),
  ],
);

export type SmsMessage = typeof smsMessagesTable.$inferSelect;
export type InsertSmsMessage = typeof smsMessagesTable.$inferInsert;
