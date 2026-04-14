/**
 * Playwright config — browser-level smoke tests for the Math
 * Collective SPA + Express backend.
 *
 * What this config does:
 *   1. Boots the backend (which also serves the built SPA from
 *      public/app/) on a unique test port.
 *   2. Runs every spec in tests/e2e/*.spec.js against that server.
 *   3. Tears the server down when the suite finishes.
 *
 * Single browser (Chromium) on purpose — CI minutes matter and
 * adding firefox/webkit doubles/triples runtime for diminishing
 * returns. Add them back if a real cross-browser bug surfaces.
 *
 * Notes:
 *   - Tests target the real Supabase via SESSION_DB_URL — they
 *     should NOT mutate data (use read-only checks or unique-suffix
 *     fixtures). The boundary is: vitest covers behaviour with
 *     mocks; Playwright covers "the page actually renders + the
 *     network calls actually fire". Don't try to make Playwright
 *     a second integration test suite.
 *   - `npm run e2e` runs headless. `npm run e2e:headed` opens a
 *     browser window for debugging.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT) || 4567;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Run files in parallel, but within a file run serially — the SPA
  // shares a session cookie via the BrowserContext, so two tests in
  // the same file racing each other on auth state is messy.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "line" : "list",
  timeout: 30_000,

  use: {
    baseURL:        BASE_URL,
    trace:          "retain-on-failure",
    screenshot:     "only-on-failure",
    actionTimeout:  10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Auto-boot the backend (which serves the built SPA at /app/) for
  // the duration of the test run. Re-uses an already-running server
  // in dev so you can keep `npm run dev:server` open and iterate.
  webServer: {
    command:               `node backend/server.js`,
    url:                   `${BASE_URL}/api/health`,
    reuseExistingServer:   !process.env.CI,
    timeout:               60_000,
    env: {
      NODE_ENV:                "development",
      PORT:                    String(PORT),
      // Tests need real env to boot — pick them up from .env.local
      // via dotenv (loaded in server.js). The below fall back to
      // dummies so the test can at least get past validateEnv() on a
      // CI box without secrets configured.
      SUPABASE_URL:              process.env.SUPABASE_URL              || "https://dummy.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key-dummy-service-role-key",
      SESSION_SECRET:            process.env.SESSION_SECRET            || "test-secret-test-secret-test-secret",
    },
  },
});
