/**
 * Tests for backend/config/env.js validateEnv().
 *
 * We exercise it by mutating process.env in each test and re-importing
 * the module fresh. process.exit is stubbed to throw a recognisable
 * error so we can assert "the validator decided to bail" without
 * actually killing the test runner.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Snapshot the relevant subset of env at the start of each test so
// other tests' mutations can't leak in.
const KEYS = [
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "FRONTEND_URL",
  "SESSION_DB_URL",
  "REDIS_URL",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "OPENROUTER_API_KEY",
  "CONTACT_EMAIL",
  "CONTACT_APP_PASSWORD",
];
let snapshot;

let exitSpy;
let errorSpy;
let warnSpy;

beforeEach(() => {
  snapshot = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

  // Stub process.exit so failures throw a recognisable error instead
  // of killing vitest. Tests assert on this error.
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`__EXIT__:${code}`);
  });
  // Silence the validator's own console output during tests; capture for assertions.
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy  = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  exitSpy.mockRestore();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  vi.resetModules();
});

// Helper: import a fresh copy each time so module-level state doesn't carry over.
async function loadValidator() {
  vi.resetModules();
  return (await import("../../backend/config/env.js")).validateEnv;
}

// ════════════════════════════════════════════════════════════
// Required vars
// ════════════════════════════════════════════════════════════

describe("validateEnv — required vars", () => {
  it("succeeds when all required vars are set (dev defaults)", async () => {
    process.env.NODE_ENV                  = "development";
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "x".repeat(20);

    const validateEnv = await loadValidator();
    const env = validateEnv();
    expect(env.isProd).toBe(false);
    expect(env.port).toBe(3000);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("exits when SUPABASE_URL is missing", async () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "x".repeat(20);

    const validateEnv = await loadValidator();
    expect(() => validateEnv()).toThrow("__EXIT__:1");
    expect(errorSpy).toHaveBeenCalled();
    // The error printed to stderr should name the missing key for the operator.
    const printed = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toMatch(/SUPABASE_URL/);
  });

  it("exits when SESSION_SECRET is too short", async () => {
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "tooshort"; // 8 chars, min is 16

    const validateEnv = await loadValidator();
    expect(() => validateEnv()).toThrow("__EXIT__:1");
    const printed = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toMatch(/SESSION_SECRET/);
    expect(printed).toMatch(/16 chars|openssl/);
  });

  it("exits when SUPABASE_URL is not a URL", async () => {
    process.env.SUPABASE_URL              = "not-a-url";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "x".repeat(20);

    const validateEnv = await loadValidator();
    expect(() => validateEnv()).toThrow("__EXIT__:1");
  });
});

// ════════════════════════════════════════════════════════════
// Production-only vars
// ════════════════════════════════════════════════════════════

describe("validateEnv — production-only vars", () => {
  // Helper to set the universally-required tier-1 vars to valid values.
  function setRequiredOk() {
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "x".repeat(20);
  }

  it("dev mode tolerates missing FRONTEND_URL", async () => {
    process.env.NODE_ENV = "development";
    setRequiredOk();
    delete process.env.FRONTEND_URL;

    const validateEnv = await loadValidator();
    const env = validateEnv();
    expect(env.isProd).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("production exits when FRONTEND_URL is missing", async () => {
    process.env.NODE_ENV = "production";
    setRequiredOk();
    delete process.env.FRONTEND_URL;
    process.env.SESSION_DB_URL = "postgres://x";  // satisfy the new tier-2 store check

    const validateEnv = await loadValidator();
    expect(() => validateEnv()).toThrow("__EXIT__:1");
    const printed = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toMatch(/FRONTEND_URL/);
    expect(printed).toMatch(/PRODUCTION/);
  });

  it("production succeeds with FRONTEND_URL + SESSION_DB_URL set", async () => {
    process.env.NODE_ENV       = "production";
    process.env.FRONTEND_URL   = "https://mathcollective.bmsit.in";
    process.env.SESSION_DB_URL = "postgres://x";  // any of REDIS_URL or SESSION_DB_URL satisfies tier-2
    setRequiredOk();

    const validateEnv = await loadValidator();
    const env = validateEnv();
    expect(env.isProd).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("production exits when neither SESSION_DB_URL nor REDIS_URL is set", async () => {
    process.env.NODE_ENV     = "production";
    process.env.FRONTEND_URL = "https://mathcollective.bmsit.in";
    setRequiredOk();
    delete process.env.SESSION_DB_URL;
    delete process.env.REDIS_URL;

    const validateEnv = await loadValidator();
    expect(() => validateEnv()).toThrow("__EXIT__:1");
    const printed = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(printed).toMatch(/SESSION_DB_URL/);
    expect(printed).toMatch(/REDIS_URL/);
    // Operator should see a hint about why MemoryStore is not the answer.
    expect(printed).toMatch(/MemoryStore/);
  });

  it("production accepts REDIS_URL alone (no SESSION_DB_URL needed)", async () => {
    process.env.NODE_ENV     = "production";
    process.env.FRONTEND_URL = "https://mathcollective.bmsit.in";
    process.env.REDIS_URL    = "redis://localhost:6379";
    setRequiredOk();
    delete process.env.SESSION_DB_URL;

    const validateEnv = await loadValidator();
    expect(() => validateEnv()).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════
// Feature gates — warn but never fatal
// ════════════════════════════════════════════════════════════

describe("validateEnv — feature gates", () => {
  function setRequiredOk() {
    process.env.NODE_ENV                  = "development";
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "x".repeat(20);
  }

  it("reports all features enabled when their vars are set", async () => {
    setRequiredOk();
    process.env.RAZORPAY_KEY_ID      = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET  = "secret";
    process.env.VAPID_PUBLIC_KEY     = "pub";
    process.env.VAPID_PRIVATE_KEY    = "priv";
    process.env.OPENROUTER_API_KEY   = "or-key";
    process.env.CONTACT_EMAIL        = "a@b.co";
    process.env.CONTACT_APP_PASSWORD = "p";
    process.env.SENTRY_DSN           = "https://x@o.ingest.sentry.io/1";  // Phase 14 — Sentry gate

    const validateEnv = await loadValidator();
    const env = validateEnv();
    expect(env.enabledFeatures.length).toBe(5);
    expect(env.disabledFeatures.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("reports a feature as disabled and warns when its vars are missing", async () => {
    setRequiredOk();
    // No Razorpay vars.
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    process.env.VAPID_PUBLIC_KEY     = "pub";
    process.env.VAPID_PRIVATE_KEY    = "priv";

    const validateEnv = await loadValidator();
    const env = validateEnv();
    expect(env.disabledFeatures).toContain("Razorpay payments");
    expect(env.enabledFeatures).toContain("Web push notifications");
    // Operator should see a clear note about WHICH feature and its docs.
    const warned = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(warned).toMatch(/Razorpay/);
    expect(warned).toMatch(/PAYMENT_SETUP\.md/);
  });

  it("missing feature vars do NOT cause exit (only warn)", async () => {
    setRequiredOk();
    // No optional vars at all.
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CONTACT_EMAIL;
    delete process.env.CONTACT_APP_PASSWORD;
    delete process.env.SENTRY_DSN;

    const validateEnv = await loadValidator();
    const env = validateEnv();
    expect(env.disabledFeatures.length).toBe(5);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// Returned config
// ════════════════════════════════════════════════════════════

describe("validateEnv — returned config object", () => {
  it("respects PORT env var, falls back to 3000", async () => {
    process.env.NODE_ENV                  = "development";
    process.env.SUPABASE_URL              = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    process.env.SESSION_SECRET            = "x".repeat(20);

    process.env.PORT = "8080";
    let env = (await loadValidator())();
    expect(env.port).toBe(8080);

    delete process.env.PORT;
    env = (await loadValidator())();
    expect(env.port).toBe(3000);
  });
});
