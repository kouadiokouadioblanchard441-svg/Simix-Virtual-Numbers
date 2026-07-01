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
import { getAppUrl } from "./lib/app-url";
import { db } from "@workspace/db";
import { countriesTable } from "@workspace/db";
import { eq, and, notInArray } from "drizzle-orm";
import { globalRateLimit, checkUserBlocked, checkMaintenanceMode, checkIpBlacklist } from "./middlewares/security";
import { isMaintenanceMode } from "./lib/settings";

const app: Express = express();

/* ── Trust reverse proxy (Plesk / nginx / Cloudflare) ──
 * Allows Express to correctly read X-Forwarded-Proto and X-Forwarded-For
 * headers set by the upstream proxy, so req.protocol returns "https"
 * and req.ip returns the real client IP instead of the proxy IP.       */
app.set("trust proxy", 1);

/* ── CORS — explicit allowlist + env-var overrides ────────────────────────
 * Allowed origins (in priority order):
 *   1. APP_URL env var (set this on your host to your public domain)
 *   2. CORS_ORIGINS env var — comma-separated list of extra origins
 *   3. REPLIT_DEV_DOMAIN / REPLIT_DOMAINS — auto-injected by Replit
 *   4. getAppUrl() fallback (https://simix.site by default)
 *   5. localhost variants for local dev                                   */
const buildAllowedOrigins = (): Set<string> => {
  const origins = new Set<string>();

  /* Primary domain from APP_URL or built-in fallback — add www + non-www + http + https */
  const appUrl = getAppUrl();
  if (appUrl) {
    const cleaned = appUrl.replace(/\/$/, "");
    origins.add(cleaned);
    try {
      const u = new URL(cleaned);
      const bare = u.hostname.replace(/^www\./, "");
      for (const scheme of ["http", "https"]) {
        origins.add(`${scheme}://${bare}`);
        origins.add(`${scheme}://www.${bare}`);
      }
    } catch { /* ignore */ }
  }

  /* Extra origins: CORS_ORIGINS=https://foo.com,https://bar.com */
  if (process.env.CORS_ORIGINS) {
    for (const o of process.env.CORS_ORIGINS.split(",")) {
      const trimmed = o.trim().replace(/\/$/, "");
      if (trimmed) origins.add(trimmed);
    }
  }

  /* Replit-injected domains */
  if (process.env.REPLIT_DEV_DOMAIN) origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  if (process.env.REPLIT_DOMAINS) {
    for (const d of process.env.REPLIT_DOMAINS.split(",")) {
      const domain = d.trim();
      if (domain) origins.add(`https://${domain}`);
    }
  }

  /* Always allow same-server origin (frontend served from same process) */
  origins.add("http://localhost:5000");
  origins.add("http://localhost:3000");
  origins.add("http://localhost:5173");

  logger.info({ origins: [...origins] }, "[cors] Allowed origins");
  return origins;
};

/* Origins are rebuilt on first request; reset cache with _resetCorsCache() */
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
      logger.warn({ origin, allowed: [...getAllowedOrigins()] }, "[cors] Rejected cross-origin request");
      callback(new Error(`CORS: origin not allowed (${origin})`));
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
        scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
        scriptSrcElem: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:", "https:"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:", "https://challenges.cloudflare.com"],
        frameSrc: ["'self'", "https://challenges.cloudflare.com"],
        frameAncestors: ["'self'", "https://*.replit.dev", "https://*.repl.co", "https://*.replit.app", "https://*.kirk.replit.dev"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        scriptSrcAttr: ["'none'"],
      },
    },

    /* Clickjacking: disabled so Replit preview iframe can embed the app.
     * Protection is handled by the CSP frame-ancestors directive above.  */
    frameguard: false,

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
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return next();
  }
  if (url === "/manifest.webmanifest" || url === "/manifest.json") {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
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
  if (url.startsWith("/screenshots/")) {
    res.setHeader("Cache-Control", "public, max-age=2592000");
    res.setHeader("Content-Type", "image/png");
    return next();
  }
  if (url.startsWith("/downloads/") && url.endsWith(".apk")) {
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="simix.apk"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return next();
  }
  if (url === "/.well-known/assetlinks.json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
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

/* ── Global JSON error handler ─────────────────────────────────
 * Catches any unhandled error thrown in a route or middleware.
 * Returns JSON instead of Express's default HTML 500 page.    */
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { status?: number; statusCode?: number })?.statusCode
    ?? 500;
  const message =
    (err as { message?: string })?.message ??
    "Une erreur interne est survenue.";
  logger.error({ err }, "[app] Unhandled error");
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
});

/* ── Maintenance page HTML (served server-side — no React needed) ── */
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Simix — Maintenance</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100dvh;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;overflow-x:hidden}
    .hero{width:100%;max-width:480px;aspect-ratio:1/1;overflow:hidden;flex-shrink:0}
    .hero img{width:100%;height:200%;object-fit:cover;object-position:top center;display:block}
    .card{width:100%;max-width:480px;padding:0 24px 48px;display:flex;flex-direction:column}
    h1{color:#DC2626;font-weight:800;font-size:clamp(18px,5vw,22px);text-align:center;margin:0 0 12px;line-height:1.35}
    .sub{color:#6B7280;font-size:clamp(13px,3.5vw,15px);text-align:center;margin:0 0 28px;line-height:1.6}
    .divider{height:1px;background:#E5E7EB;margin-bottom:24px}
    .row{display:flex;align-items:center;gap:10px;margin-bottom:18px}
    .badge{background:#DC2626;color:#fff;font-weight:700;font-size:13px;letter-spacing:.06em;padding:4px 14px;border-radius:999px;text-transform:uppercase}
    .row2{display:flex;align-items:center;gap:10px;margin-bottom:20px}
    .icon-wrap{width:32px;height:32px;border-radius:50%;border:2px solid #D1D5DB;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .est{color:#374151;font-size:14px}
    .est strong{color:#DC2626;font-weight:700}
    .contact{border:1px solid #E5E7EB;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:28px;background:#FAFAFA}
    .mail-icon{width:38px;height:38px;border-radius:50%;border:2px solid #BFDBFE;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#EFF6FF}
    .contact-label{color:#6B7280;font-size:12px;margin-bottom:3px}
    .contact a{color:#2563EB;font-weight:700;font-size:14px;text-decoration:none}
    .btn{width:100%;background:#1D4ED8;color:#fff;font-weight:700;font-size:16px;border:none;border-radius:14px;padding:16px 24px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;letter-spacing:.01em;-webkit-tap-highlight-color:transparent}
    .btn:hover{background:#1E40AF}
    .btn:active{background:#1E3A8A;transform:scale(.99)}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="hero">
    <img src="/maintenance-hero.png" alt="Maintenance"/>
  </div>
  <div class="card">
    <h1>Le site est actuellement en maintenance.</h1>
    <p class="sub">Nous travaillons à améliorer votre expérience.<br>Veuillez réessayer dans quelques instants.</p>
    <div class="divider"></div>
    <div class="row">
      <span style="font-weight:700;color:#111827;font-size:15px">Statut :</span>
      <span class="badge">Maintenance</span>
    </div>
    <div class="row2">
      <span class="icon-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </span>
      <span class="est">Temps estimé : <strong>Bientôt disponible</strong></span>
    </div>
    <div class="contact">
      <span class="mail-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,14 22,4"/></svg>
      </span>
      <div>
        <div class="contact-label">Pour toute information, contactez-nous :</div>
        <a href="mailto:support@simix.site">support@simix.site</a>
      </div>
    </div>
    <button class="btn" id="btn" onclick="retry()">
      <svg id="ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
      <span id="lbl">Réessayer plus tard</span>
    </button>
  </div>
  <script>
    function retry(){
      document.getElementById('lbl').textContent='Vérification…';
      document.getElementById('ico').style.animation='spin 1s linear infinite';
      document.getElementById('btn').disabled=true;
      setTimeout(()=>location.reload(),1000);
    }
  </script>
</body>
</html>`;

/* ── Production: serve compiled React frontend + SPA fallback ── */
if (process.env.NODE_ENV !== "development") {
  const currentDir = (globalThis as { __dirname?: string }).__dirname;
  if (currentDir) {
    const publicDir = path.join(currentDir, "public");
    if (existsSync(publicDir)) {
      app.use(express.static(publicDir));
      /* SPA fallback — serve maintenance page instead of index.html when active */
      app.use(async (_req, res) => {
        if (await isMaintenanceMode()) {
          res.status(503).send(MAINTENANCE_HTML);
          return;
        }
        res.sendFile(path.join(publicDir, "index.html"));
      });
    } else {
      logger.warn({ publicDir }, "Frontend public dir not found — static serving disabled");
    }
  }
}

export default app;
