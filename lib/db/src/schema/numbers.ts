import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { servicesTable } from "./services";
import { countriesTable } from "./countries";

export const virtualNumbersTable = pgTable(
  "virtual_numbers",
  {
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
    /**
     * Type de numéro :
     *   "activation" — numéro one-shot (défaut), valide ~20 min
     *   "hosting"    — numéro en location longue durée (1 jour ou 3 heures)
     */
    numberType: text("number_type").notNull().default("activation"),
    /**
     * Durée de location pour les numéros hosting.
     *   "1day"   — 24 heures
     *   "3hours" — 3 heures
     *   null     — pour les numéros d'activation classiques
     */
    hostingDuration: text("hosting_duration"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    /* Support for "list active numbers for a user" (very frequent query) */
    index("idx_virtual_numbers_user_id").on(t.userId),
    /* Support for expiry sweeper — finds waiting numbers past expiresAt */
    index("idx_virtual_numbers_expires_at").on(t.expiresAt),
    /* Support for filtering by status (waiting / received / cancelled / expired) */
    index("idx_virtual_numbers_status").on(t.status),
    /* Support for 5sim poller lookup by externalOrderId */
    index("idx_virtual_numbers_external_order_id").on(t.externalOrderId),
  ],
);

export type VirtualNumber = typeof virtualNumbersTable.$inferSelect;
export type InsertVirtualNumber = typeof virtualNumbersTable.$inferInsert;
