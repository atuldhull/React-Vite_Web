/**
 * Unit tests for backend/controllers/payment/config.js.
 *
 * Config helpers that gate the payment controller's behaviour:
 *   - isConfigured() controls whether any payment endpoint works
 *   - assertConfigured() is the throw-gate inside mutations
 *   - publicKeyId() is what frontend gets (must be null when unset
 *     so the SPA disables the pay button instead of showing a broken
 *     checkout)
 *   - webhookSecret() is checked separately (a prod deploy without
 *     webhook signing would silently accept forged events)
 *
 * All four are pure functions of process.env — stash + restore the
 * relevant vars per test to avoid bleeding between cases.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isConfigured,
  assertConfigured,
  publicKeyId,
  webhookSecret,
} from "../../backend/controllers/payment/config.js";

let saved;

beforeEach(() => {
  saved = {
    id:     process.env.RAZORPAY_KEY_ID,
    secret: process.env.RAZORPAY_KEY_SECRET,
    hook:   process.env.RAZORPAY_WEBHOOK_SECRET,
  };
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

afterEach(() => {
  if (saved.id     !== undefined) process.env.RAZORPAY_KEY_ID        = saved.id;     else delete process.env.RAZORPAY_KEY_ID;
  if (saved.secret !== undefined) process.env.RAZORPAY_KEY_SECRET    = saved.secret; else delete process.env.RAZORPAY_KEY_SECRET;
  if (saved.hook   !== undefined) process.env.RAZORPAY_WEBHOOK_SECRET = saved.hook;  else delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

// ═══════════════════════════════════════════════════════════
// isConfigured
// ═══════════════════════════════════════════════════════════

describe("isConfigured", () => {
  it("is false when neither env var is set", () => {
    expect(isConfigured()).toBe(false);
  });

  it("is false when only KEY_ID is set", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_X";
    expect(isConfigured()).toBe(false);
  });

  it("is false when only KEY_SECRET is set", () => {
    process.env.RAZORPAY_KEY_SECRET = "shhhh";
    expect(isConfigured()).toBe(false);
  });

  it("is true when both are set", () => {
    process.env.RAZORPAY_KEY_ID     = "rzp_test_X";
    process.env.RAZORPAY_KEY_SECRET = "shhhh";
    expect(isConfigured()).toBe(true);
  });

  it("is false when KEY_ID is empty string (not just unset)", () => {
    process.env.RAZORPAY_KEY_ID     = "";
    process.env.RAZORPAY_KEY_SECRET = "shhhh";
    expect(isConfigured()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// assertConfigured — the throw-gate
// ═══════════════════════════════════════════════════════════

describe("assertConfigured", () => {
  it("throws a coded error when not configured", () => {
    try {
      assertConfigured();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err.code).toBe("RAZORPAY_NOT_CONFIGURED");
      expect(err.message).toMatch(/RAZORPAY_KEY_ID/);
    }
  });

  it("does not throw when both keys are set", () => {
    process.env.RAZORPAY_KEY_ID     = "rzp_test_X";
    process.env.RAZORPAY_KEY_SECRET = "shhhh";
    expect(() => assertConfigured()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════
// publicKeyId — what the SPA receives
// ═══════════════════════════════════════════════════════════

describe("publicKeyId", () => {
  it("returns null when unset — so frontend knows to disable the pay button", () => {
    expect(publicKeyId()).toBeNull();
  });

  it("returns the key when set (safe to expose client-side)", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    expect(publicKeyId()).toBe("rzp_test_abc");
  });
});

// ═══════════════════════════════════════════════════════════
// webhookSecret — independent of KEY_ID/KEY_SECRET
// ═══════════════════════════════════════════════════════════

describe("webhookSecret", () => {
  it("returns null when unset (webhook handler must refuse to verify)", () => {
    expect(webhookSecret()).toBeNull();
  });

  it("returns the secret when set", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "hmac-secret";
    expect(webhookSecret()).toBe("hmac-secret");
  });

  it("is independent of key_id + key_secret configuration", () => {
    // You can have API keys without a webhook secret and vice versa.
    process.env.RAZORPAY_KEY_ID        = "rzp_test_X";
    process.env.RAZORPAY_KEY_SECRET    = "shhhh";
    process.env.RAZORPAY_WEBHOOK_SECRET = "";
    expect(webhookSecret()).toBeNull();
  });
});
