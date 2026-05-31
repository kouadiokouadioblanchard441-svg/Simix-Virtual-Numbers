import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);
const resolvedPort = Number.isNaN(port) || port <= 0 ? 3000 : port;

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "..", "..", "dist", "public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /* Stable filenames so git tracking doesn't change on every build */
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (info) => {
          /* Keep content hash only for images/fonts — CSS and JS are stable */
          const ext = info.name?.split(".").pop() ?? "";
          if (["png", "jpg", "jpeg", "gif", "svg", "webp", "woff", "woff2", "ttf"].includes(ext)) {
            return "assets/[name]-[hash][extname]";
          }
          return "assets/[name][extname]";
        },
      },
    },
  },
  server: {
    port: resolvedPort,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: resolvedPort,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
