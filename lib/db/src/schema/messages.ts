import {
  pgTable,
  text,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { virtualNumbersTable } from "./numbers";

export const smsMessagesTable = pgTable("sms_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  numberId: uuid("number_id")
    .notNull()
    .references(() => virtualNumbersTable.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(),
  body: text("body").notNull(),
  code: text("code").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SmsMessage = typeof smsMessagesTable.$inferSelect;
export type InsertSmsMessage = typeof smsMessagesTable.$inferInsert;
