/**
 * Pinning tests for the no-enumeration contract on /auth/resend-verification
 * and /auth/forgot-password.
 *
 * The point of these endpoints is that an attacker cannot use them as
 * a binary oracle ("is alice@x.com a registered user?"). The previous
 * implementations forwarded Supabase's error.message to the wire, which
 * distinguished:
 *   - "User not found"           → email is NOT registered
 *   - "Email rate limit"         → email IS registered, recently mailed
 *   - "Already verified"         → email IS registered + verified
 *
 * Post-hardening, both endpoints return the SAME success body shape no
 * matter what Supabase says — server logs still record the real reason
 * for operators to debug.
 *
 * We mock the Supabase client at the module level so we don't reach the
 * real backend, and we mock the logger so its calls don't pollute
 * stdout.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../backend/config/supabase.js", () => {
  const auth = {
    resend:                  vi.fn(),
    resetPasswordForEmail:   vi.fn(),
    // Unused in these tests but imported by the controller.
    signInWithPassword:      vi.fn(),
    signUp:                  vi.fn(),
    getUser:                 vi.fn(),
    admin:                   { updateUserById: vi.fn() },
  };
  return { default: { auth, from: vi.fn() } };
});

vi.mock("../../backend/config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let authController;
let supabaseModule;

beforeEach(async () => {
  vi.resetModules();
  supabaseModule = (await import("../../backend/config/supabase.js")).default;
  authController = (await import("../../backend/controllers/authController.js")).default;
  vi.clearAllMocks();
});

// Minimal req/res stubs — enough for these handlers.
function makeReqRes(body = {}) {
  const req = { body, protocol: "http", get: () => "localhost" };
  const res = {
    statusCode: 200,
    body:       null,
    status(c)   { this.statusCode = c; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

describe("/auth/resend-verification — no enumeration", () => {
  it("returns the same response shape when Supabase says the user does not exist", async () => {
    supabaseModule.auth.resend.mockResolvedValue({
      error: { message: "User not found" },
    });
    const { req, res } = makeReqRes({ email: "ghost@example.com" });
    await authController.resendVerification(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/If that address has an unverified account/i);
    expect(res.body.message).not.toMatch(/not found/i);
  });

  it("returns the same response shape when Supabase says rate-limited", async () => {
    supabaseModule.auth.resend.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    });
    const { req, res } = makeReqRes({ email: "real@example.com" });
    await authController.resendVerification(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).not.toMatch(/rate limit/i);
  });

  it("returns the same response shape on the happy path", async () => {
    supabaseModule.auth.resend.mockResolvedValue({ error: null });
    const { req, res } = makeReqRes({ email: "real@example.com" });
    await authController.resendVerification(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns the same response shape when the upstream throws", async () => {
    supabaseModule.auth.resend.mockRejectedValue(new Error("network exploded"));
    const { req, res } = makeReqRes({ email: "real@example.com" });
    await authController.resendVerification(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).not.toMatch(/network/i);
  });

  it("still 400s when no email is supplied (input validation, not enumeration)", async () => {
    const { req, res } = makeReqRes({});
    await authController.resendVerification(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("/auth/forgot-password — no enumeration", () => {
  it("returns the same response shape when Supabase errors (rate-limited)", async () => {
    supabaseModule.auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    });
    const { req, res } = makeReqRes({ email: "anyone@example.com" });
    await authController.forgotPassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/If an account exists/i);
    expect(res.body.message).not.toMatch(/rate limit/i);
  });

  it("returns the same response shape on success", async () => {
    supabaseModule.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const { req, res } = makeReqRes({ email: "real@example.com" });
    await authController.forgotPassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns the same response shape when the upstream throws", async () => {
    supabaseModule.auth.resetPasswordForEmail.mockRejectedValue(new Error("DNS exploded"));
    const { req, res } = makeReqRes({ email: "real@example.com" });
    await authController.forgotPassword(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).not.toMatch(/DNS/i);
  });

  it("still 400s when no email is supplied", async () => {
    const { req, res } = makeReqRes({});
    await authController.forgotPassword(req, res);
    expect(res.statusCode).toBe(400);
  });
});
