import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // The React plugin is required for the automatic JSX transform — without
  // it, .jsx test files crash with "React is not defined" (because they
  // never `import React`, on purpose, since React 17+ doesn't need it).
  // Vite 7 / vitest 4 don't auto-include this plugin the way Vite 8 did.
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
    exclude: ["node_modules", "public"],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend/src"),
    },
  },
});
