/**
 * Élection de leader pour les workers background.
 *
 * Plusieurs processus Node tournent en parallèle contre la même base
 * (aperçu Replit "Start application", artifact "api-server" en dev,
 * potentiellement un déploiement de production séparé). Si chacun
 * démarre ses propres timers (poller 5sim, retry email, réconciliation
 * Clapay/PawaPay…), les jobs s'exécutent en double sur les mêmes lignes
 * et créent des races (ex : deux tentatives d'envoi d'email simultanées,
 * doubles remboursements potentiels).
 *
 * Ce module utilise un bail (lease) stocké en base — une seule ligne
 * (id=1) dans `worker_leader_lock` — pour garantir qu'un seul processus
 * à la fois exécute les workers, quel que soit le nombre de processus
 * démarrés. Si le leader meurt sans renouveler son bail, un autre
 * processus prend automatiquement le relais après expiration.
 */
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const LOCK_ROW_ID = 1;
const LEASE_MS = 30_000; // durée du bail
const RENEW_INTERVAL_MS = 10_000; // renouvelle 3x avant expiration

const HOLDER_ID = `${process.env["HOSTNAME"] ?? "host"}-${process.pid}-${randomBytes(4).toString("hex")}`;

let isLeader = false;
let renewTimer: NodeJS.Timeout | null = null;

async function ensureRowExists(): Promise<void> {
  await db.execute(sql`
    INSERT INTO worker_leader_lock (id, holder_id, lease_until)
    VALUES (${LOCK_ROW_ID}, '', 'epoch'::timestamptz)
    ON CONFLICT (id) DO NOTHING
  `);
}

/** Tente d'acquérir (ou de renouveler) le bail. Retourne true si ce processus est/reste leader. */
async function tryAcquireOrRenew(): Promise<boolean> {
  const now = new Date();
  const newLease = new Date(now.getTime() + LEASE_MS);
  const result = await db.execute(sql`
    UPDATE worker_leader_lock
    SET holder_id = ${HOLDER_ID}, lease_until = ${newLease}
    WHERE id = ${LOCK_ROW_ID}
      AND (holder_id = ${HOLDER_ID} OR lease_until < ${now})
    RETURNING id
  `);
  return result.rows.length > 0;
}

/**
 * Démarre l'élection de leader. `onBecomeLeader` n'est appelé qu'une seule
 * fois, la première fois que ce processus obtient le bail. Un timer
 * renouvelle ensuite le bail en continu pour rester leader tant que le
 * processus est vivant.
 */
export function electLeaderAndRun(onBecomeLeader: () => void): void {
  void (async () => {
    try {
      await ensureRowExists();
    } catch (err) {
      logger.warn({ err }, "[leader-lock] Échec de seed de la ligne — nouvelle tentative via le cycle de renouvellement");
    }

    const cycle = async () => {
      try {
        const acquired = await tryAcquireOrRenew();
        if (acquired && !isLeader) {
          isLeader = true;
          logger.info({ holder: HOLDER_ID }, "[leader-lock] Ce processus devient leader — démarrage des workers background");
          onBecomeLeader();
        } else if (!acquired && isLeader) {
          // Ne devrait pas arriver tant que le renouvellement réussit à temps ;
          // signalé au cas où (ex: coupure DB prolongée).
          logger.warn("[leader-lock] Bail perdu — un autre processus a pu prendre le relais");
          isLeader = false;
        } else if (!acquired) {
          logger.debug("[leader-lock] Un autre processus est déjà leader — en attente");
        }
      } catch (err) {
        logger.warn({ err }, "[leader-lock] Erreur pendant l'élection de leader");
      }
    };

    await cycle();
    renewTimer = setInterval(() => { void cycle(); }, RENEW_INTERVAL_MS);
  })();
}

export function stopLeaderElection(): void {
  if (renewTimer) { clearInterval(renewTimer); renewTimer = null; }
}

export function isCurrentLeader(): boolean {
  return isLeader;
}
