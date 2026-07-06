import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { getAppUrl } from "../lib/app-url";

const router = Router();

/* ── GET /manifest.webmanifest — correct MIME type for PWA ──────────────
 * Express static middleware may serve .webmanifest as application/octet-stream
 * on servers whose mime DB doesn't know the extension.
 * This explicit route always returns application/manifest+json so Chrome
 * recognises the manifest and shows the PWA install prompt.              */
router.get("/manifest.webmanifest", (req, res) => {
  const currentDir = (globalThis as { __dirname?: string }).__dirname ?? __dirname;
  /* Mirror the same two-step publicDir resolution used in app.ts so the
   * manifest is found whether the server runs from dist/ or from the root. */
  const publicDir = existsSync(path.join(currentDir, "public"))
    ? path.join(currentDir, "public")
    : path.join(currentDir, "..", "public");
  const manifestPath = path.join(publicDir, "manifest.webmanifest");
  const fallback     = path.join(publicDir, "manifest.json");

  const filePath = existsSync(manifestPath) ? manifestPath : existsSync(fallback) ? fallback : null;

  if (!filePath) {
    res.status(404).send("manifest not found");
    return;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.status(200).send(content);
  } catch {
    res.status(500).send("error reading manifest");
  }
});

/* ── Public pages included in the sitemap ── */
const SITEMAP_PAGES = [
  { path: "/",                                   priority: "1.0", changefreq: "weekly"  },
  { path: "/register",                           priority: "0.9", changefreq: "monthly" },
  { path: "/login",                              priority: "0.8", changefreq: "monthly" },
  { path: "/forgot-password",                    priority: "0.3", changefreq: "yearly"  },
  { path: "/legal/cgu",                          priority: "0.5", changefreq: "yearly"  },
  { path: "/legal/politique-confidentialite",    priority: "0.5", changefreq: "yearly"  },
  { path: "/legal/mentions-legales",             priority: "0.5", changefreq: "yearly"  },
  { path: "/legal/cookies",                      priority: "0.4", changefreq: "yearly"  },
];

function buildSitemap(baseUrl: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_PAGES.map(({ path, priority, changefreq }) => {
    const loc = `${baseUrl}${path}`;
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9',
    '          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
    urls,
    "</urlset>",
  ].join("\n");
}

/* GET /sitemap.xml */
router.get("/sitemap.xml", (_req, res) => {
  const baseUrl = getAppUrl();
  const xml = buildSitemap(baseUrl);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  res.status(200).send(xml);
});

/* GET /robots.txt */
router.get("/robots.txt", (_req, res) => {
  const baseUrl = getAppUrl();
  const content = [
    "User-agent: *",
    "",
    "# Pages publiques indexables",
    "Allow: /$",
    "Allow: /register$",
    "Allow: /login$",
    "Allow: /forgot-password$",
    "Allow: /legal/",
    "",
    "# Pages privées — espace utilisateur",
    "Disallow: /dashboard",
    "Disallow: /profile",
    "Disallow: /wallet",
    "Disallow: /history",
    "Disallow: /numbers",
    "Disallow: /services",
    "Disallow: /countries",
    "Disallow: /notifications",
    "Disallow: /pin",
    "Disallow: /verify-email",
    "Disallow: /reset-password",
    "Disallow: /splash",
    "Disallow: /bienvenue",
    "Disallow: /crypto-history",
    "",
    "# Pages admin — accès interdit",
    "Disallow: /admin",
    "Disallow: /console",
    "Disallow: /admin-login",
    "Disallow: /admin/secure-login",
    "Disallow: /toast-demo",
    "",
    "# API",
    "Disallow: /api/",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(200).send(content);
});

export default router;
