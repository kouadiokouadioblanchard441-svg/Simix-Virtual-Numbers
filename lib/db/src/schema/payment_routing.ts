import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

/* ── Mobile Operators (MTN, Orange, Wave, Moov, etc.) ──────────────── */
export const mobileOperatorsTable = pgTable("mobile_operators", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  color: text("color").notNull().default("#6B7280"),
  countryCodes: jsonb("country_codes").notNull().default([]),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MobileOperator = typeof mobileOperatorsTable.$inferSelect;
export type InsertMobileOperator = typeof mobileOperatorsTable.$inferInsert;

/* ── Payment Gateways (Fapshi, PayDunya, Flutterwave, PawaPay, etc.) ── */
export const paymentGatewaysTable = pgTable("payment_gateways", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  apiUrl: text("api_url"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  webhookSecret: text("webhook_secret"),
  type: text("type").notNull().default("both"),
  supportedCountries: jsonb("supported_countries").notNull().default([]),
  supportedOperators: jsonb("supported_operators").notNull().default([]),
  active: boolean("active").notNull().default(true),
  testMode: boolean("test_mode").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentGateway = typeof paymentGatewaysTable.$inferSelect;
export type InsertPaymentGateway = typeof paymentGatewaysTable.$inferInsert;

/* ── Payment Routes (country + operator → gateway, with priority) ───── */
export const paymentRoutesTable = pgTable("payment_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryCode: text("country_code").notNull(),
  operatorSlug: text("operator_slug").notNull(),
  transactionType: text("transaction_type").notNull().default("deposit"),
  primaryGatewayId: uuid("primary_gateway_id").references(() => paymentGatewaysTable.id, { onDelete: "set null" }),
  secondaryGatewayId: uuid("secondary_gateway_id").references(() => paymentGatewaysTable.id, { onDelete: "set null" }),
  tertiaryGatewayId: uuid("tertiary_gateway_id").references(() => paymentGatewaysTable.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.countryCode, t.operatorSlug, t.transactionType),
}));

export type PaymentRoute = typeof paymentRoutesTable.$inferSelect;
export type InsertPaymentRoute = typeof paymentRoutesTable.$inferInsert;

/* ── Payment Route Logs (audit trail) ─────────────────────────────── */
export const paymentRouteLogsTable = pgTable("payment_route_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").references(() => paymentRoutesTable.id, { onDelete: "set null" }),
  gatewayId: uuid("gateway_id").references(() => paymentGatewaysTable.id, { onDelete: "set null" }),
  transactionId: text("transaction_id"),
  eventType: text("event_type").notNull().default("payment"),
  status: text("status").notNull().default("success"),
  responseTimeMs: integer("response_time_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  adminId: text("admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentRouteLog = typeof paymentRouteLogsTable.$inferSelect;
export type InsertPaymentRouteLog = typeof paymentRouteLogsTable.$inferInsert;
