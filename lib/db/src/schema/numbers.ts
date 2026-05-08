import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";
import { countriesTable } from "./countries";

export const virtualNumbersTable = pgTable("virtual_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => servicesTable.id),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countriesTable.id),
  phoneNumber: text("phone_number").notNull(),
  status: text("status").notNull().default("waiting"),
  price: integer("price").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  smsScheduledAt: timestamp("sms_scheduled_at", { withTimezone: true }),
  externalOrderId: text("external_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type VirtualNumber = typeof virtualNumbersTable.$inferSelect;
export type InsertVirtualNumber = typeof virtualNumbersTable.$inferInsert;
