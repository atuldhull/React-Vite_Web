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
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "assets/app.css";
          }

          return "assets/[name][extname]";
        },
      },
    },
  },
});
