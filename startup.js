/**
 * Simix — Plesk startup entry point
 *
 * Plesk Node.js hosting calls this file on every app restart.
 * It compiles the backend + frontend, then hands off to index.cjs.
 *
 * Plesk config:
 *   Application startup file: startup.js
 *   (or) npm start  →  package.json "start" script calls this file
 */
"use strict";

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const root = __dirname;
const PORT = Number(process.env.PORT || 3000);

/* ── Variables d'environnement requises ────────────────────────── */
const REQUIRED_ENV = [
  { key: "DATABASE_URL",     label: "URL de la base de données PostgreSQL",  example: "postgresql://<host>:5432/<database>" },
  { key: "SESSION_SECRET",   label: "Clé secrète pour les sessions",          example: "une-longue-chaine-aleatoire-de-32-caracteres" },
  { key: "ADMIN_JWT_SECRET", label: "Clé secrète JWT pour l'admin",           example: "une-autre-longue-chaine-aleatoire" },
];

/* SUPABASE_DATABASE_URL est accepté comme alternative à DATABASE_URL */
function checkEnv() {
  const missing = [];
  for (const { key, label, example } of REQUIRED_ENV) {
    if (key === "DATABASE_URL") {
      if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
        missing.push({ key, label, example });
      }
    } else if (!process.env[key]) {
      missing.push({ key, label, example });
    }
  }
  return missing;
}

/* ── Page d'erreur de diagnostic ──────────────────────────────── */
function startDiagnosticServer(missing, buildError) {
  const rows = missing.map(({ key, label, example }) => `
    <tr>
      <td><code>${key}</code></td>
      <td>${label}</td>
      <td><small style="color:#aaa">${example}</small></td>
    </tr>`).join("");

  const buildSection = buildError ? `
    <div class="section error">
      <h2>⚠️ Erreur de compilation</h2>
      <pre>${buildError.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
    </div>` : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SIMIX — Configuration requise</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #09090B; color: #fff; padding: 2rem; }
    h1 { color: #A855F7; margin-bottom: 0.5rem; }
    .subtitle { color: #aaa; margin-bottom: 2rem; }
    .section { background: #18181B; border: 1px solid #27272A; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .section.error { border-color: #EF4444; }
    h2 { margin-bottom: 1rem; font-size: 1rem; color: #E4E4E7; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #71717A; font-size: 0.75rem; padding: 0.5rem; border-bottom: 1px solid #27272A; }
    td { padding: 0.75rem 0.5rem; border-bottom: 1px solid #27272A; font-size: 0.875rem; vertical-align: top; }
    code { background: #27272A; padding: 2px 6px; border-radius: 4px; color: #A855F7; font-size: 0.8rem; }
    pre { background: #000; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.75rem; color: #EF4444; }
    .steps { list-style: none; counter-reset: steps; }
    .steps li { counter-increment: steps; padding: 0.75rem 0.5rem 0.75rem 3rem; position: relative; border-bottom: 1px solid #27272A; }
    .steps li:last-child { border-bottom: none; }
    .steps li::before { content: counter(steps); position: absolute; left: 0; top: 0.75rem; background: #A855F7; color: #fff; width: 1.5rem; height: 1.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; }
    .ok { color: #22C55E; }
    .badge { display: inline-block; background: #EF4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; }
  </style>
</head>
<body>
  <h1>SIMIX</h1>
  <p class="subtitle">Configuration du serveur requise avant de démarrer</p>

  ${buildSection}

  ${missing.length > 0 ? `
  <div class="section">
    <h2>🔴 Variables d'environnement manquantes <span class="badge">${missing.length} manquante(s)</span></h2>
    <table>
      <thead><tr><th>Variable</th><th>Description</th><th>Exemple de valeur</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>` : '<div class="section"><h2 class="ok">✅ Variables d\'environnement — OK</h2></div>'}

  <div class="section">
    <h2>📋 Comment configurer dans Plesk</h2>
    <ol class="steps">
      <li>Allez dans <strong>Plesk → Domaines → simix.site → Node.js</strong></li>
      <li>Cliquez sur <strong>"Variables d'environnement"</strong> (ou "Environment Variables")</li>
      <li>Ajoutez chaque variable listée ci-dessus avec sa valeur</li>
      <li>Cliquez sur <strong>"Redémarrer l'application"</strong></li>
    </ol>
  </div>

  <div class="section">
    <h2>📝 Toutes les variables à configurer</h2>
    <table>
      <thead><tr><th>Variable</th><th>Valeur</th></tr></thead>
      <tbody>
        <tr><td><code>DATABASE_URL</code></td><td>URL PostgreSQL de votre base de données (ex: chez Supabase)</td></tr>
        <tr><td><code>SESSION_SECRET</code></td><td>Chaine aléatoire longue (ex: générez avec <code>openssl rand -hex 32</code>)</td></tr>
        <tr><td><code>ADMIN_JWT_SECRET</code></td><td>Autre chaine aléatoire longue pour le panneau admin</td></tr>
        <tr><td><code>APP_URL</code></td><td><code>https://simix.site</code></td></tr>
        <tr><td><code>NODE_ENV</code></td><td><code>production</code></td></tr>
        <tr><td><code>GEMINI_API_KEY</code></td><td>Votre clé API Google Gemini (pour le support IA)</td></tr>
      </tbody>
    </table>
  </div>

  <p style="color:#52525B; font-size:0.75rem; margin-top:1rem">
    Cette page s'affiche uniquement quand la configuration est incomplète. 
    Elle disparaît automatiquement après avoir configuré les variables et redémarré l'application.
  </p>
</body>
</html>`;

  const server = http.createServer((_req, res) => {
    /* This diagnostic server runs before the Express/Helmet bundle when
     * Plesk is misconfigured. It must not become a security-header gap. */
    res.writeHead(503, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    res.end(html);
  });

  server.listen(PORT, () => {
    console.error("\n╔══════════════════════════════════════════════════════╗");
    console.error("║   SIMIX — CONFIGURATION INCOMPLÈTE                  ║");
    console.error("╚══════════════════════════════════════════════════════╝\n");
    if (missing.length > 0) {
      console.error("Variables d'environnement manquantes :");
      missing.forEach(({ key, label }) => console.error(`  ✘ ${key}  —  ${label}`));
    }
    if (buildError) {
      console.error("\nErreur de compilation :");
      console.error(buildError);
    }
    console.error(`\n→ Page de diagnostic disponible sur le port ${PORT}`);
    console.error("→ Configurez les variables dans Plesk puis redémarrez l'application.\n");
  });
}

/* ── Fonction de build ─────────────────────────────────────────── */
function run(cmd, label) {
  console.log(`\n[build] ${label}...`);
  try {
    execSync(cmd, { cwd: root, stdio: "inherit" });
    console.log(`[build] ✔ ${label} terminé`);
  } catch (err) {
    throw new Error(`Échec: ${label}\n${err.message}`);
  }
}

function needsBuild() {
  const bundle = path.join(root, "dist", "index.cjs");
  if (!fs.existsSync(bundle)) return true;

  // Frontend assets must exist — if icons or index.html are missing, rebuild
  const requiredFrontendFiles = [
    path.join(root, "public", "index.html"),
    path.join(root, "public", "icons", "icon-192x192.png"),
    path.join(root, "public", "icons", "icon-512x512.png"),
    path.join(root, "public", "sw.js"),
    path.join(root, "public", "manifest.webmanifest"),
  ];
  for (const f of requiredFrontendFiles) {
    if (!fs.existsSync(f)) {
      console.log(`[build] Fichier frontend manquant: ${path.relative(root, f)} — rebuild forcé`);
      return true;
    }
  }

  const bundleMtime = fs.statSync(bundle).mtimeMs;
  const sourceDirs = [
    path.join(root, "artifacts/api-server/src"),
    path.join(root, "artifacts/simix/src"),
    path.join(root, "lib"),
  ];

  function newerThan(dir, threshold) {
    if (!fs.existsSync(dir)) return false;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (newerThan(full, threshold)) return true;
      } else {
        if (fs.statSync(full).mtimeMs > threshold) return true;
      }
    }
    return false;
  }

  for (const dir of sourceDirs) {
    if (newerThan(dir, bundleMtime)) return true;
  }
  return false;
}

/* ── VÉRIFICATION ENVIRONNEMENT ────────────────────────────────── */
const missingVars = checkEnv();
if (missingVars.length > 0) {
  startDiagnosticServer(missingVars, null);
  return; // Arrêt — ne pas tenter de builder/démarrer sans les variables
}

/* ── BUILD ─────────────────────────────────────────────────────── */
let buildError = null;

if (needsBuild()) {
  console.log("\n[build] Fichiers sources modifiés — recompilation en cours...");
  try {
    run("pnpm install --frozen-lockfile 2>/dev/null || pnpm install", "Installation des dépendances");
    run("node artifacts/api-server/build.mjs", "Compilation backend (esbuild)");
    run(
      "cd artifacts/simix && NODE_ENV=production node_modules/.bin/vite build --config vite.config.ts",
      "Compilation frontend (Vite)"
    );
    console.log("\n[build] ✔ Build complet — démarrage du serveur\n");
  } catch (err) {
    buildError = err.message;
  }
} else {
  console.log("[build] Bundle à jour — démarrage direct\n");
}

if (buildError) {
  startDiagnosticServer([], buildError);
  return;
}

/* ── DÉMARRAGE ─────────────────────────────────────────────────── */
try {
  require("./dist/index.cjs");
} catch (err) {
  console.error("[startup] Erreur fatale au démarrage :", err.message);
  startDiagnosticServer([], err.message);
}
