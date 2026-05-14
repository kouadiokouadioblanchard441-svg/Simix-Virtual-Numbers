import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import path from "path";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachUser } from "./lib/auth";
import { globalRateLimit, checkUserBlocked, checkMaintenanceMode, checkIpBlacklist } from "./middlewares/security";
import { startFiveSimPoller } from "./lib/fivesim-poller";
import { seedProvidersFromEnv } from "./lib/seed-providers";
import { seedPaymentMethods } from "./lib/seed-payment-methods";
import { startFiveSimSyncScheduler, syncFiveSimCountries, syncFiveSimProducts } from "./lib/fivesim-sync";
import { startClapayReconciliation } from "./lib/clapay-reconciliation";
import { seedRoutingData } from "./lib/seed-routing";

const app: Express = express();

/* ── Trust reverse proxy (Plesk / nginx / Cloudflare) ──
 * Allows Express to correctly read X-Forwarded-Proto and X-Forwarded-For
 * headers set by the upstream proxy, so req.protocol returns "https"
 * and req.ip returns the real client IP instead of the proxy IP.       */
app.set("trust proxy", 1);

/* ── HTTP Security Headers ── */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

/* ── Request Logging ── */
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));

/* ── Body parsing — capture raw body for webhook signature verification ──
 * The verify callback runs BEFORE JSON.parse, giving us the original bytes.
 * This is required for PawaPay Content-Digest verification: re-serializing
 * req.body with JSON.stringify() will not match the original bytes PawaPay
 * signed (different whitespace / key order), causing all signed webhooks to
 * be silently dropped.
 * Stored on req.rawBody (cast via augmented Request type below).          */
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

app.use(
  express.json({
    limit: "8mb",
    verify: (req: express.Request, _res, buf) => {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(cookieParser());

/* ── Global rate limit (200 req/min per IP) ── */
app.use(globalRateLimit);

/* ── Maintenance mode — returns 503 on all non-admin routes ── */
app.use(checkMaintenanceMode);

/* ── IP Blacklist — block banned IP addresses ── */
app.use(checkIpBlacklist);

/* ── Attach user from session cookie ── */
app.use(attachUser);

/* ── Block suspended users from all routes ── */
app.use(checkUserBlocked);

app.use("/api", router);

/* ── Production: serve compiled React frontend + SPA fallback ── */
if (process.env.NODE_ENV === "production") {
  // Banner in build.mjs sets globalThis.__dirname = __dirname (= dist/ folder in CJS bundle)
  const currentDir = (globalThis as { __dirname?: string }).__dirname;
  if (currentDir) {
    const publicDir = path.join(currentDir, "public");
    if (existsSync(publicDir)) {
      app.use(express.static(publicDir));
      app.use((_req, res) => {
        res.sendFile(path.join(publicDir, "index.html"));
      });
    } else {
      logger.warn({ publicDir }, "Frontend public dir not found — static serving disabled");
    }
  }
}

/* ── Seed reference data + providers, then start real-time sync + poller ── */
void seedPaymentMethods();
void seedRoutingData();

void seedProvidersFromEnv().then(async () => {
  startFiveSimPoller();
  startFiveSimSyncScheduler();
  startClapayReconciliation();

  /* Sync countries from 5sim immediately at startup (non-blocking) */
  try {
    const result = await syncFiveSimCountries();
    logger.info({ added: result.added, updated: result.updated, total: result.total }, "[startup] 5sim countries synced");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[startup] 5sim countries sync skipped");
  }

  /* Sync products/services from 5sim immediately at startup (non-blocking) */
  try {
    const result = await syncFiveSimProducts();
    logger.info({ added: result.added, updated: result.updated, total: result.total }, "[startup] 5sim products synced");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[startup] 5sim products sync skipped");
  }
});

export default app;
