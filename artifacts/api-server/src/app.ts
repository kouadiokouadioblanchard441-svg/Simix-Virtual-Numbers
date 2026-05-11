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
import { startFiveSimSyncScheduler } from "./lib/fivesim-sync";

const app: Express = express();

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
app.use(express.json({ limit: "8mb" }));
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

/* ── Seed providers from env vars, then start poller + sync scheduler ── */
void seedProvidersFromEnv().then(() => {
  startFiveSimPoller();
  startFiveSimSyncScheduler();
});

export default app;
