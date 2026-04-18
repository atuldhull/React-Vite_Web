/**
 * Unit tests for backend/validators/auth.js.
 *
 * Scope: pure schema parsing. No Express, no Supabase, no controllers.
 * These guard the five mutating auth endpoints — register, login,
 * forgot-password, reset-password, resend-verification.
 *
 * A schema leak here means an attacker can get past the first line of
 * input validation: malformed emails, oversized payloads, or
 * missing-field DoS all become possible.
 */

import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
} from "../../backend/validators/auth.js";

// ═══════════════════════════════════════════════════════════
// registerSchema
// ═══════════════════════════════════════════════════════════

describe("registerSchema", () => {
  it("accepts a minimal valid signup", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "longenough" });
    expect(r.success).toBe(true);
    expect(r.data.email).toBe("a@b.com");
  });

  it("accepts optional name + invite_token", () => {
    const r = registerSchema.safeParse({
      email: "a@b.com",
      password: "longenough",
      name: "Alice",
      invite_token: "tok_123",
    });
    expect(r.success).toBe(true);
  });

  it("lowercases + trims the email before accepting", () => {
    const r = registerSchema.safeParse({ email: "  Alice@B.COM  ", password: "longenough" });
    expect(r.success).toBe(true);
    expect(r.data.email).toBe("alice@b.com");
  });

  it("rejects malformed email", () => {
    const r = registerSchema.safeParse({ email: "not-an-email", password: "longenough" });
    expect(r.success).toBe(false);
  });

  it("rejects empty email", () => {
    const r = registerSchema.safeParse({ email: "", password: "longenough" });
    expect(r.success).toBe(false);
  });

  it("rejects missing password", () => {
    const r = registerSchema.safeParse({ email: "a@b.com" });
    expect(r.success).toBe(false);
  });

  it("rejects password shorter than 6 chars (register has a floor)", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "abc" });
    expect(r.success).toBe(false);
  });

  it("rejects password longer than 128 chars (DoS defence)", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "x".repeat(129) });
    expect(r.success).toBe(false);
  });

  it("rejects email longer than 320 chars (RFC upper bound)", () => {
    // 320 char cap on the whole email string; local + "@b.com" = 320 + 6 = 326
    const local = "a".repeat(320);
    const r = registerSchema.safeParse({ email: `${local}@b.com`, password: "longenough" });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// loginSchema
// ═══════════════════════════════════════════════════════════

describe("loginSchema", () => {
  it("accepts a short password (existing accounts may have weak passwords)", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });

  it("rejects malformed email", () => {
    const r = loginSchema.safeParse({ email: "no-at-sign", password: "pw" });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// forgotPasswordSchema / resendVerificationSchema
// ═══════════════════════════════════════════════════════════

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    const r = forgotPasswordSchema.safeParse({ email: "a@b.com" });
    expect(r.success).toBe(true);
  });

  it("rejects missing email", () => {
    const r = forgotPasswordSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("resendVerificationSchema", () => {
  it("accepts a valid email", () => {
    const r = resendVerificationSchema.safeParse({ email: "a@b.com" });
    expect(r.success).toBe(true);
  });

  it("rejects malformed email", () => {
    const r = resendVerificationSchema.safeParse({ email: "bad" });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// resetPasswordSchema
// ═══════════════════════════════════════════════════════════

describe("resetPasswordSchema", () => {
  it("accepts a valid reset payload", () => {
    const r = resetPasswordSchema.safeParse({
      access_token: "eyJhbGci-stub",
      new_password: "longenough",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing access_token", () => {
    const r = resetPasswordSchema.safeParse({ new_password: "longenough" });
    expect(r.success).toBe(false);
  });

  it("enforces the 6-char password floor", () => {
    const r = resetPasswordSchema.safeParse({ access_token: "tok", new_password: "abc" });
    expect(r.success).toBe(false);
  });

  it("rejects 129-char passwords (DoS cap)", () => {
    const r = resetPasswordSchema.safeParse({ access_token: "tok", new_password: "x".repeat(129) });
    expect(r.success).toBe(false);
  });
});
