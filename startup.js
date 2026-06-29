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

const root = __dirname;

function run(cmd, label) {
  console.log(`\n[build] ${label}...`);
  try {
    execSync(cmd, { cwd: root, stdio: "inherit" });
    console.log(`[build] ✔ ${label} terminé`);
  } catch (err) {
    console.error(`[build] ✘ Échec: ${label}`);
    console.error(err.message);
    process.exit(1);
  }
}

function needsBuild() {
  const bundle = path.join(root, "index.cjs");
  if (!fs.existsSync(bundle)) return true;

  const bundleMtime = fs.statSync(bundle).mtimeMs;

  // Check if any source file is newer than the bundle
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

// ── Build ─────────────────────────────────────────────────────────
if (needsBuild()) {
  console.log("\n[build] Fichiers sources modifiés — recompilation en cours...");

  // Ensure pnpm dependencies are installed
  run("pnpm install --frozen-lockfile 2>/dev/null || pnpm install", "Installation des dépendances");

  // Build backend bundle (esbuild → index.cjs)
  run("node artifacts/api-server/build.mjs", "Compilation backend (esbuild)");

  // Build frontend (Vite → public/)
  run(
    "cd artifacts/simix && NODE_ENV=production node_modules/.bin/vite build --config vite.config.ts",
    "Compilation frontend (Vite)"
  );

  console.log("\n[build] ✔ Build complet — démarrage du serveur\n");
} else {
  console.log("[build] Bundle à jour — démarrage direct\n");
}

// ── Start ─────────────────────────────────────────────────────────
// Load and run the compiled bundle in the same process
require("./index.cjs");
