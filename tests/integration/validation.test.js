/**
 * Integration tests for the validateBody() + schema pairing.
 *
 * We boot a minimal Express app with just the request-id middleware
 * and a couple of validated routes (auth/login, contact, payment
 * create-order) so we can assert the 400 response shape from the
 * outside — the contract client code will actually depend on.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requestIdMiddleware } from "../../backend/middleware/requestId.js";
import { validateBody } from "../../backend/validators/common.js";
import { loginSchema, registerSchema } from "../../backend/validators/auth.js";
import { contactSchema } from "../../backend/validators/contact.js";
import { createOrderSchema, verifyPaymentSchema } from "../../backend/validators/payment.js";

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());

  const echo = (req, res) => res.json({ ok: true, body: req.body });

  app.post("/login",        validateBody(loginSchema),        echo);
  app.post("/register",     validateBody(registerSchema),     echo);
  app.post("/contact",      validateBody(contactSchema),      echo);
  app.post("/create-order", validateBody(createOrderSchema),  echo);
  app.post("/verify",       validateBody(verifyPaymentSchema), echo);
  return app;
}

// ════════════════════════════════════════════════════════════
// Response shape
// ════════════════════════════════════════════════════════════

describe("validateBody — 400 response shape", () => {
  it("returns { error:'Validation failed', requestId, issues[] } on failure", async () => {
    const res = await request(buildApp()).post("/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(typeof res.body.requestId).toBe("string");
    expect(res.body.requestId.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.issues)).toBe(true);
    // Both required fields are flagged, with field-level paths.
    const paths = res.body.issues.map(i => i.path).sort();
    expect(paths).toEqual(["email", "password"]);
    // Each issue has a human-readable message.
    for (const iss of res.body.issues) {
      expect(typeof iss.message).toBe("string");
      expect(iss.message.length).toBeGreaterThan(0);
    }
  });

  it("echoes the same x-request-id header value inside `requestId`", async () => {
    const res = await request(buildApp())
      .post("/login")
      .set("x-request-id", "caller-abc-123")
      .send({});
    expect(res.body.requestId).toBe("caller-abc-123");
    expect(res.headers["x-request-id"]).toBe("caller-abc-123");
  });
});

// ════════════════════════════════════════════════════════════
// Coercion / transformation behaviour
// ════════════════════════════════════════════════════════════

describe("validateBody — replaces req.body with the parsed value", () => {
  it("lowercases + trims emails, trims name", async () => {
    const res = await request(buildApp()).post("/register").send({
      email:    "  ALICE@EXAMPLE.COM  ",
      password: "goodpassword",
      name:     "  Alice  ",
    });
    expect(res.status).toBe(200);
    // Verify Zod's transforms flowed to the controller:
    expect(res.body.body.email).toBe("alice@example.com");
    expect(res.body.body.name).toBe("Alice");
  });

  it("trims & normalises contact-form message", async () => {
    const res = await request(buildApp()).post("/contact").send({
      email:   "x@y.co",
      message: "  hi there  ",
    });
    expect(res.status).toBe(200);
    expect(res.body.body.message).toBe("hi there");
  });
});

// ════════════════════════════════════════════════════════════
// Specific rules
// ════════════════════════════════════════════════════════════

describe("auth schemas — specific rules", () => {
  it("registerSchema rejects a password shorter than 6 chars", async () => {
    const res = await request(buildApp()).post("/register").send({
      email: "x@y.co", password: "short",
    });
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("password");
  });

  it("registerSchema accepts a password of exactly 6", async () => {
    const res = await request(buildApp()).post("/register").send({
      email: "x@y.co", password: "abc123",
    });
    expect(res.status).toBe(200);
  });

  it("loginSchema rejects a malformed email address", async () => {
    const res = await request(buildApp()).post("/login").send({
      email: "not-an-email", password: "anything",
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("email");
  });

  it("loginSchema rejects a 10KB password (DoS defence, size cap)", async () => {
    const res = await request(buildApp()).post("/login").send({
      email: "x@y.co", password: "a".repeat(10_000),
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("password");
  });
});

describe("contactSchema — specific rules", () => {
  it("rejects a message over 5000 chars", async () => {
    const res = await request(buildApp()).post("/contact").send({
      email: "x@y.co", message: "a".repeat(5001),
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("message");
  });

  it("rejects an email missing entirely", async () => {
    const res = await request(buildApp()).post("/contact").send({
      message: "hello",
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("email");
  });
});

describe("paymentSchema — specific rules", () => {
  it("createOrder requires plan_name", async () => {
    const res = await request(buildApp()).post("/create-order").send({});
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("plan_name");
  });

  it("verifyPayment signature must be 64-char hex", async () => {
    const res = await request(buildApp()).post("/verify").send({
      razorpay_order_id:   "order_x",
      razorpay_payment_id: "pay_x",
      razorpay_signature:  "nothex!!",
    });
    expect(res.status).toBe(400);
    expect(res.body.issues.map(i => i.path)).toContain("razorpay_signature");
  });

  it("verifyPayment accepts a 64-char lowercase hex signature", async () => {
    const res = await request(buildApp()).post("/verify").send({
      razorpay_order_id:   "order_x",
      razorpay_payment_id: "pay_x",
      razorpay_signature:  "a".repeat(64),
    });
    expect(res.status).toBe(200);
  });
});
