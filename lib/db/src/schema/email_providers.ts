import { pgTable, text, uuid, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

/* ─────────────────────────────────────────────────────────────────
   EMAIL PROVIDERS — table des fournisseurs d'emails configurés
───────────────────────────────────────────────────────────────── */
export const emailProvidersTable = pgTable("email_providers", {
  id:              uuid("id").primaryKey().defaultRandom(),
  name:            text("name").notNull(),           // "Resend", "Amazon SES"…
  slug:            text("slug").notNull().unique(),   // "resend", "ses", "postmark"…
  priority:        integer("priority").notNull().default(100), // 1 = highest
  active:          boolean("active").notNull().default(false),
  apiKeyEnc:       text("api_key_enc"),              // AES-256-GCM encrypted
  apiSecretEnc:    text("api_secret_enc"),           // encrypted (Mailjet, SES…)
  domain:          text("domain"),                   // Mailgun sending domain
  region:          text("region"),                   // SES region (us-east-1…)
  config:          jsonb("config").$type<Record<string, string>>(), // extra per-provider config
  healthStatus:    text("health_status").notNull().default("unknown"), // healthy|degraded|down|unknown
  lastHealthCheck: timestamp("last_health_check", { withTimezone: true }),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  totalSent:       integer("total_sent").notNull().default(0),
  totalFailed:     integer("total_failed").notNull().default(0),
  lastError:       text("last_error"),
  lastErrorAt:     timestamp("last_error_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/* ─────────────────────────────────────────────────────────────────
   EMAIL QUEUE — file d'attente persistante (aucun email perdu)
───────────────────────────────────────────────────────────────── */
export const emailQueueTable = pgTable("email_queue", {
  id:              uuid("id").primaryKey().defaultRandom(),
  idempotencyKey:  text("idempotency_key").notNull().unique(), // évite les doublons
  toEmail:         text("to_email").notNull(),
  fromEmail:       text("from_email").notNull(),
  subject:         text("subject").notNull(),
  html:            text("html").notNull(),
  textContent:     text("text_content"),
  status:          text("status").notNull().default("pending"), // pending|sent|failed|cancelled
  providerId:      uuid("provider_id").references(() => emailProvidersTable.id, { onDelete: "set null" }),
  attempts:        integer("attempts").notNull().default(0),
  maxAttempts:     integer("max_attempts").notNull().default(5),
  nextRetryAt:     timestamp("next_retry_at", { withTimezone: true }),
  sentAt:          timestamp("sent_at", { withTimezone: true }),
  error:           text("error"),
  metadata:        jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/* ─────────────────────────────────────────────────────────────────
   EMAIL SEND LOGS — journal détaillé de chaque tentative d'envoi
───────────────────────────────────────────────────────────────── */
export const emailSendLogsTable = pgTable("email_send_logs", {
  id:          uuid("id").primaryKey().defaultRandom(),
  queueId:     uuid("queue_id").references(() => emailQueueTable.id, { onDelete: "cascade" }),
  providerId:  uuid("provider_id").references(() => emailProvidersTable.id, { onDelete: "set null" }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  status:      text("status").notNull(), // success|failure
  latencyMs:   integer("latency_ms"),
  responseId:  text("response_id"),      // message ID returned by provider
  error:       text("error"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailProvider    = typeof emailProvidersTable.$inferSelect;
export type NewEmailProvider = typeof emailProvidersTable.$inferInsert;
export type EmailQueueItem   = typeof emailQueueTable.$inferSelect;
export type NewEmailQueueItem = typeof emailQueueTable.$inferInsert;
export type EmailSendLog     = typeof emailSendLogsTable.$inferSelect;
