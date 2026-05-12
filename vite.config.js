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
        // Phase 29 — split the heavy vendor libraries into their own
        // chunks so they cache independently of app code. Before this:
        // the 850KB `app` chunk + 685KB HomePage bundled three.js,
        // framer-motion, gsap and katex inline. Every deploy busted
        // both. Now Three.js + postprocessing live in a `three-vendor`
        // chunk that only changes when those libs bump, framer in
        // `motion-vendor`, katex in `math-vendor`, etc. Repeat visits
        // become near-instant since these chunks don't churn.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/three/") || id.includes("/postprocessing/")) {
            return "three-vendor";
          }
          if (id.includes("/framer-motion/")) {
            return "motion-vendor";
          }
          if (id.includes("/gsap/") || id.includes("/@gsap/")) {
            return "gsap-vendor";
          }
          if (id.includes("/katex/")) {
            return "math-vendor";
          }
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
