import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Release identifier — git SHA on Render (RENDER_GIT_COMMIT) or
// a stable "dev" value locally. Same identifier shared by both the
// frontend Sentry SDK (via __SENTRY_RELEASE__ define) and the
// vite-plugin (for source-map upload tagging), so uploaded maps
// match the release of any error captured at runtime.
const sentryRelease = process.env.RENDER_GIT_COMMIT || process.env.SENTRY_RELEASE || "dev";

// @sentry/vite-plugin uploads source maps to Sentry at build time and
// strips them from public/app so they aren't shipped to the browser.
// It NO-OPS without SENTRY_AUTH_TOKEN — meaning local builds, CI
// preview builds, and any deploy without the secret just skip upload
// and leave maps in place (where the existing `sourcemap: true`
// option emitted them). Same feature-gate pattern as Sentry init.
const sentryPlugin =
  process.env.SENTRY_AUTH_TOKEN &&
  process.env.SENTRY_ORG &&
  process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        org:        process.env.SENTRY_ORG,
        project:    process.env.SENTRY_PROJECT,
        authToken:  process.env.SENTRY_AUTH_TOKEN,
        release:    { name: sentryRelease },
        // Strip the .map files from the published assets after upload
        // so prod users don't download them (Sentry now has them).
        sourcemaps: {
          filesToDeleteAfterUpload: ["./public/app/assets/**/*.js.map"],
        },
      })
    : null;

// rollup-plugin-visualizer — opt-in bundle analyser. Activated by
// `ANALYZE=1 npm run build`. Emits public/app/stats.html with the
// treemap + sunburst views so a maintainer can see at a glance which
// chunk a regression came from. Skipped by default so CI builds stay
// fast and don't accumulate stats files in the build artifact.
const visualizerPlugin =
  process.env.ANALYZE
    ? visualizer({
        filename: path.resolve(__dirname, "public/app/stats.html"),
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false,    // CI / docker hosts don't have a default browser
      })
    : null;

export default defineConfig({
  root: path.resolve(__dirname, "frontend"),
  base: "/app/",
  plugins: [react(), glsl(), sentryPlugin, visualizerPlugin].filter(Boolean),
  define: {
    // Available globally in frontend code as __SENTRY_RELEASE__.
    // JSON-stringified so the value is a string literal in the bundle.
    __SENTRY_RELEASE__: JSON.stringify(sentryRelease),
  },
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
