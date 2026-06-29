import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, cp } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(artifactDir, "..", "..");

// Output directly to workspace root — Plesk pulls root files reliably
const outDir = rootDir;

async function buildAll() {
  // Clean previous API build files from root
  const apiFiles = [
    "index.cjs",
    "pino-file.cjs",
    "pino-pretty.cjs",
    "pino-worker.cjs",
    "thread-stream-worker.cjs",
    "migrations",
  ];
  await Promise.all(
    apiFiles.map((f) => rm(path.join(outDir, f), { recursive: true, force: true }))
  );

  // Clean old CJS worker files from dist/ (but keep dist/index.cjs — it's a static Plesk wrapper)
  const distDir = path.join(rootDir, "dist");
  const oldDistFiles = [
    "pino-file.cjs",
    "pino-pretty.cjs",
    "pino-worker.cjs",
    "thread-stream-worker.cjs",
    "migrations",
  ];
  await Promise.all(
    oldDistFiles.map((f) => rm(path.join(distDir, f), { recursive: true, force: true }))
  );

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outdir: outDir,
    outExtension: { ".js": ".cjs" },
    logLevel: "info",
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    plugins: [
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    banner: {
      js: "globalThis.__dirname = __dirname;",
    },
  });

  // Copy DB migrations to root/migrations/ (same dir as index.cjs)
  const migrationsSource = path.resolve(rootDir, "lib/db/drizzle");
  const migrationsDest   = path.resolve(outDir, "migrations");
  await cp(migrationsSource, migrationsDest, { recursive: true });
  console.log("✔ Migration files copied → migrations/");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
