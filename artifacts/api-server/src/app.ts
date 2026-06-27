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
import { db } from "@workspace/db";
import { countriesTable } from "@workspace/db";
import { eq, and, notInArray } from "drizzle-orm";
import { globalRateLimit, checkUserBlocked, checkMaintenanceMode, checkIpBlacklist } from "./middlewares/security";
import { seedProvidersFromEnv } from "./lib/seed-providers";
import { seedPaymentMethods } from "./lib/seed-payment-methods";
import { startFiveSimPoller } from "./lib/fivesim-poller";
import { startFiveSimSyncScheduler, syncFiveSimCountries, syncFiveSimProducts } from "./lib/fivesim-sync";
import { startClapayReconciliation } from "./lib/clapay-reconciliation";
import { startPawaPayReconciliation } from "./lib/pawapay-reconciliation";
import { seedRoutingData } from "./lib/seed-routing";
import { seedCountryPaymentConfigs } from "./lib/seed-country-payment-configs";

const app: Express = express();

/* ── Trust reverse proxy (Plesk / nginx / Cloudflare) ──
 * Allows Express to correctly read X-Forwarded-Proto and X-Forwarded-For
 * headers set by the upstream proxy, so req.protocol returns "https"
 * and req.ip returns the real client IP instead of the proxy IP.       */
app.set("trust proxy", 1);

/* ── CORS — explicit allowlist, never reflect Origin blindly ──────────────
 * origin: true was a critical vulnerability that allowed any domain to make
 * credentialed cross-origin requests (CSRF vector).
 * We now restrict to known origins only.                                 */
const buildAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>();
  if (process.env.APP_URL) origins.add(process.env.APP_URL.replace(/\/$/, ""));
  if (process.env.REPLIT_DEV_DOMAIN) origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (process.env.REPLIT_DOMAINS) {
    for (const d of process.env.REPLIT_DOMAINS.split(",")) {
      const domain = d.trim();
      if (domain) origins.add(`https://${domain}`);
    }
  }
  /* Fallback for local dev */
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:5000");
    origins.add("http://localhost:3000");
    origins.add("http://localhost:5173");
  }
  return origins;
};

let _allowedOrigins: Set<string> | null = null;
function getAllowedOrigins(): Set<string> {
  if (!_allowedOrigins) _allowedOrigins = buildAllowedOrigins();
  return _allowedOrigins;
}

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      /* Allow same-origin requests (no Origin header = server-to-server or curl) */
      if (!origin) return callback(null, true);
      if (getAllowedOrigins().has(origin)) return callback(null, true);
      logger.warn({ origin }, "[cors] Rejected cross-origin request");
      callback(new Error("CORS: origin not allowed"));
    },
  }),
);

/* ── HTTP Security Headers ─────────────────────────────────────────────── */
app.use(
  helmet({
    /* CORP: cross-origin to allow PWA assets fetched from the same server */
    crossOriginResourcePolicy: { policy: "cross-origin" },

    /* CSP: block XSS. 'unsafe-inline' for styles is required by Tailwind v4.
     * Script nonces would be ideal but require SSR integration — this is a
     * SPA so all scripts are hashed by Vite at build time from /assets/.    */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:", "https:"],
        fontSrc: ["'self'", "data:"],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        frameSrc: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },

    /* Clickjacking: allow same-origin frames only (PWA works fine) */
    frameguard: { action: "sameorigin" },

    /* HSTS: force HTTPS for 1 year, include subdomains */
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: true,
    },

    /* Block MIME sniffing */
    noSniff: true,

    /* Referrer policy */
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

/* ── Permissions-Policy — restrict powerful browser features ── */
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  );
  next();
});

/* ── PWA & Static asset cache headers ── */
app.use((req, res, next) => {
  const url = req.path;

  if (url === "/sw.js" || url === "/sw.ts") {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    return next();
  }
  if (url === "/manifest.webmanifest" || url === "/manifest.json") {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", "application/manifest+json");
    return next();
  }
  if (url.startsWith("/assets/")) {
    const isHashed = /\-[a-f0-9]{8,}\.(js|css|woff2?|png|svg|webp)$/.test(url);
    if (isHashed) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    }
    return next();
  }
  if (url.startsWith("/icons/")) {
    res.setHeader("Cache-Control", "public, max-age=2592000");
    return next();
  }
  next();
});

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

/* ── Body parsing — capture raw body for webhook signature verification ──
 * Webhook paths (PawaPay, Clapay) need the raw bytes for HMAC/digest check.
 * Regular API routes are capped at 256 KB to prevent request amplification.
 * Webhook routes are capped at 1 MB (gateway payloads are always < 10 KB,
 * but 1 MB gives room without being dangerously large).                   */
const WEBHOOK_PATHS_SET = new Set([
  "/api/wallet/pawapay/webhook",
  "/api/wallet/pawapay/refund-webhook",
  "/api/wallet/clapay/webhook",
]);

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

const rawBodyCapture: express.RequestHandler = (req, _res, buf) => {
  (req as express.Request & { rawBody?: string }).rawBody = buf.toString("utf8");
};

/* Webhook paths: higher limit, always capture raw body */
app.use((req, res, next) => {
  if (WEBHOOK_PATHS_SET.has(req.path)) {
    express.json({ limit: "1mb", verify: rawBodyCapture })(req, res, next);
  } else {
    next();
  }
});

/* All other routes: 256 KB limit */
app.use((req, res, next) => {
  if (!WEBHOOK_PATHS_SET.has(req.path)) {
    express.json({ limit: "256kb", verify: rawBodyCapture })(req, res, next);
  } else {
    next();
  }
});

app.use(express.urlencoded({ extended: true, limit: "64kb" }));
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

/* ── Public: registration country picker (no auth required) ──────────────
 * Uses Drizzle ORM (no raw SQL) to prevent any injection surface.
 * Error details are never sent to the client to avoid leaking DB internals. */
const EXCLUDED_REGISTRATION_COUNTRIES = [
  "MA","DZ","TN","EG","LY","MR","SD","FR","GB","BE","US","CA","DE","NL",
  "SE","IT","ES","PT","AU","JP","IN","BR","MX","KZ","RU","UA","CN","KR",
  "TR","SA","AE","QA","KW","IQ","IR","JO","LB","IL","SY","PK","BD","VN",
  "TH","PH","ID","MY","LK","NP","MM","KH","LA","MN","UZ","TJ","KG","TM",
  "AZ","AM","GE","AL","RS","MK","BA","HR","BG","RO","HU","PL","CZ","SK",
  "SI","EE","LV","LT","FI","DK","NO","AT","CH","IE","LU","MC","AD","LI",
  "SM","VA","MT","CY","GR","BY","MD","XK","ME","MO","HK","TW","SG","BN",
  "PW","GU","MH","FM","NR","WS","TO","VU","SB","PG","FJ","CK","NU","TV",
  "KI","NZ","NC","PF","RE",
];

app.get("/api/public/registration-countries", async (_req, res) => {
  try {
    const rows = await db
      .select({
        code: countriesTable.code,
        dialCode: countriesTable.dialCode,
        name: countriesTable.name,
        flag: countriesTable.flag,
      })
      .from(countriesTable)
      .where(
        and(
          eq(countriesTable.enabled, true),
          notInArray(countriesTable.code, EXCLUDED_REGISTRATION_COUNTRIES),
        ),
      )
      .orderBy(countriesTable.sortOrder);

    res.json(
      rows.map((r) => ({
        code: r.code.toLowerCase(),
        dial: r.dialCode,
        label: r.name,
        flag: r.flag,
      })),
    );
  } catch (err) {
    /* Never expose DB error details to the client */
    logger.error({ err }, "[public] registration-countries query failed");
    res.status(500).json({ error: "Impossible de charger les pays." });
  }
});

app.use("/api", router);

/* ── Production: serve compiled React frontend + SPA fallback ── */
if (process.env.NODE_ENV === "production") {
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
void seedCountryPaymentConfigs();
void seedRoutingData();

void seedProvidersFromEnv().then(async () => {
  startFiveSimPoller();
  startFiveSimSyncScheduler();
  startClapayReconciliation();
  startPawaPayReconciliation();

  try {
    const result = await syncFiveSimCountries();
    logger.info({ added: result.added, updated: result.updated, total: result.total }, "[startup] 5sim countries synced");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[startup] 5sim countries sync skipped");
  }

  try {
    const result = await syncFiveSimProducts();
    logger.info({ added: result.added, updated: result.updated, total: result.total }, "[startup] 5sim products synced");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[startup] 5sim products sync skipped");
  }
});

export default app;
