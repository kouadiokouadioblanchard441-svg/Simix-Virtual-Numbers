import { pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

/* ─────────────────────────────────────────────────────────────────
   WORKER LEADER LOCK — élection de leader pour les workers background
   Empêche plusieurs processus (Replit dev preview, artifact api-server,
   déploiement Plesk…) de faire tourner en double les jobs périodiques
   (poller 5sim, retry email, réconciliation Clapay/PawaPay…) contre la
   même base de données.
   Une seule ligne (id=1) — le processus qui détient un bail non expiré
   est l'unique leader autorisé à exécuter les workers.
───────────────────────────────────────────────────────────────── */
export const workerLeaderLockTable = pgTable("worker_leader_lock", {
  id:         smallint("id").primaryKey(),
  holderId:   text("holder_id").notNull().default(""),
  leaseUntil: timestamp("lease_until", { withTimezone: true }).notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type WorkerLeaderLock = typeof workerLeaderLockTable.$inferSelect;
