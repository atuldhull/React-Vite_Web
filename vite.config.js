import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.resolve(__dirname, "frontend"),
  base: "/app/",
  plugins: [react(), glsl()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend/src"),
    },
    // dedupe ensures every import of these specifiers — including from
    // deeply nested deps (leva ships zustand@3, @react-three pulls in
    // tunnel-rat which ships zustand@4) — resolves to the project's
    // top-level copy. Without this, multiple React/zustand pairs end up
    // in the bundle and the React dispatcher null-error crashes every
    // form on first interaction.
    dedupe: ["react", "react-dom", "react/jsx-runtime", "scheduler", "zustand"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    open: "/app/",
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "public/app"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Content-hashed filenames. Previously stable names (`app.js`,
        // `app.css`, `<Route>.js`) meant every deploy reused the same
        // URL. The service worker's cache-first strategy for static
        // assets then pinned OLD JS to that filename forever — the
        // exact mechanism that kept the `isValidPrivateKey` crash
        // alive on second-browser-profile users after the fix shipped
        // in commit 23cad10. Hashed names let old SW cache entries
        // become orphaned automatically on every deploy.
        entryFileNames: "assets/app-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "assets/app-[hash].css";
          }

          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
