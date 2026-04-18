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
    // Registers @testing-library/jest-dom matchers globally — without
    // this, `.toBeInTheDocument()` etc. throw "Invalid Chai property"
    // at runtime. Only affects tests that use jsdom + RTL.
    setupFiles: ["./tests/setup.js"],

    // ── Coverage ──
    // Scoped deliberately to the files that currently have meaningful
    // test coverage. Including the rest of the codebase (untested
    // React pages, controllers without behavioural tests) would
    // anchor the baseline near zero and make the threshold useless
    // as a regression gate.
    //
    // Policy: as new test suites land, ADD the new source file(s) to
    // this include list in the SAME PR — that's what turns the
    // coverage gate from a "catches deletions" backstop into a
    // forward-going invariant. Adding a file to the list means
    // "this code is guarded"; leaving it out means "untested, not
    // yet guarded".
    //
    // Thresholds sit a few points below the current measured values.
    // Intent is "catch obvious regressions" (test suite deletion, a
    // module refactored to bypass its guards), not enforce a
    // specific quality bar — premature precision here would make CI
    // flake on tiny diff-noise.
    coverage: {
      provider:         "v8",
      reporter:         ["text", "text-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        // Backend — middleware/config/lib all have real tests; the
        // two controllers are the ones with request-level tests.
        "backend/middleware/**",
        "backend/config/**",
        "backend/lib/**",
        "backend/controllers/authController.js",
        "backend/controllers/healthController.js",
        // Validators — each of these gates a mutating API surface.
        // All tested in tests/unit/*-validators.test.js +
        // tests/unit/all-validators.test.js.
        "backend/validators/auth.js",
        "backend/validators/events.js",
        "backend/validators/payment.js",
        "backend/validators/messaging.js",
        "backend/validators/challenges.js",
        "backend/validators/certificates.js",
        "backend/validators/admin.js",
        "backend/validators/contact.js",
        "backend/validators/projects.js",
        "backend/validators/announcements.js",
        // Socket layer — entire backend/socket/* now covered.
        // chat.js is the E2EE relay, presence.js the live-users
        // tracker, notifications.js the push fan-out, quiz.js the
        // live-quiz state machine.
        "backend/socket/chat.js",
        "backend/socket/presence.js",
        "backend/socket/notifications.js",
        "backend/socket/quiz.js",
        // Frontend — keep this list small + explicit. Extend as
        // tests land for new files.
        "frontend/src/store/auth-store.js",
        "frontend/src/lib/cn.js",
        "frontend/src/lib/roles.js",
        "frontend/src/components/ErrorBoundary.jsx",
        "frontend/src/components/RouteErrorBoundary.jsx",
        "frontend/src/components/auth/ProtectedRoute.jsx",
        "frontend/src/components/auth/GuestOnlyRoute.jsx",
      ],
      exclude: [
        "backend/scripts/**",
        "**/*.test.{js,jsx}",
      ],
      thresholds: {
        // Measured 66 / 56 / 70 / 68 across the include list above.
        // Threshold sits ~10 points lower to leave room for small
        // refactors that briefly dip coverage on their way to new
        // tests, without fragile CI failures.
        statements: 55,
        branches:   45,
        functions:  55,
        lines:      55,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend/src"),
    },
  },
});
