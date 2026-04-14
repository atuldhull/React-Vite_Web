/**
 * Global test setup — loaded by vitest.config.js via `test.setupFiles`.
 *
 * Currently does one thing: register @testing-library/jest-dom's custom
 * matchers (toBeInTheDocument, toHaveClass, etc.) on vitest's expect().
 * Without this, any component test using those matchers hits
 * "Invalid Chai property: toBeInTheDocument" — not obvious from the
 * stack trace, which is why we centralise it here instead of making
 * each test file remember to import it.
 *
 * Safe for non-component tests too: the matchers are only *activated*
 * by tests that actually call them, and importing jest-dom doesn't do
 * DOM work at import time.
 */

import "@testing-library/jest-dom/vitest";

// Some modules (e.g. backend/middleware/sessionConfig.js) construct
// the express-session middleware at module load time, which triggers
// a deprecation warning when SESSION_SECRET is unset. Tests don't use
// the real secret — provide a stable test-only value here so importing
// those modules in test runs is silent and safe.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-test-secret-test";

