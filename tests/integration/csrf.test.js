/**
 * Tests for backend/middleware/csrfProtection.js + the
 * GET /api/csrf-token route, exercised end-to-end with supertest.
 *
 * The contract being enforced:
 *   1. GET /api/csrf-token returns a token + sets the paired cookie.
 *   2. Mutating requests WITHOUT a token are rejected with 403 + the
 *      standard error envelope (`error`, `code: "CSRF_INVALID"`,
 *      `requestId`).
 *   3. Mutating requests WITH a valid token succeed.
 *   4. Skip-list paths (webhook, csrf-token endpoint, health probes)
 *      bypass CSRF — webhook tests still pass without a token.
 *   5. Read methods (GET/HEAD/OPTIONS) are never CSRF-checked.
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import session from "express-session";

import { requestIdMiddleware } from "../../backend/middleware/requestId.js";
import { responseShapeMiddleware } from "../../backend/middleware/errorShape.js";
import {
  csrfProtection,
  invalidCsrfTokenError,
} from "../../backend/middleware/csrfProtection.js";
import csrfRoutes from "../../backend/routes/csrfRoutes.js";

// Minimal app that mirrors the relevant slice of createApp() — just
// what's needed to exercise CSRF in isolation. Real app's createApp()
// bootstraps a lot more (helmet, cors, full sessions); the trust-proxy
// test already covers the "real app wires it correctly" angle.
function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(responseShapeMiddleware);
  app.use(express.json());
  app.use(session({
    secret: "test-secret-test-secret-test",
    resave: false,
    saveUninitialized: true,    // anonymous callers need a session id
    cookie: { httpOnly: true, sameSite: "lax", secure: false },
  }));
  app.use(cookieParser());
  app.use("/api/csrf-token", csrfRoutes);
  app.use("/api", csrfProtection);

  // Probe routes for testing
  app.get ("/api/probe",     (_req, res) => res.json({ ok: true, method: "GET" }));
  app.post("/api/probe",     (_req, res) => res.json({ ok: true, method: "POST" }));
  app.put ("/api/probe",     (_req, res) => res.json({ ok: true, method: "PUT" }));
  app.delete("/api/probe",   (_req, res) => res.json({ ok: true, method: "DELETE" }));

  // Simulate the skip-listed routes
  app.post("/api/payment/webhook", (_req, res) => res.json({ ok: true, route: "webhook" }));
  app.get ("/api/health",          (_req, res) => res.json({ ok: true }));

  // Error handler — same shape as app.js's so the 403 + CSRF_INVALID
  // contract is what we assert on.
  app.use((err, req, res, _next) => {
    if (err === invalidCsrfTokenError || err?.code === "EBADCSRFTOKEN") {
      return res.status(403).json({
        error:     "Invalid or missing CSRF token",
        code:      "CSRF_INVALID",
        requestId: req.id,
      });
    }
    res.status(500).json({ error: err?.message || "boom", requestId: req.id });
  });

  return app;
}

let app;
beforeEach(() => { app = buildApp(); });

// ════════════════════════════════════════════════════════════
// Token endpoint
// ════════════════════════════════════════════════════════════

describe("GET /api/csrf-token", () => {
  it("returns a csrfToken string + sets the paired cookie", async () => {
    const res = await request(app).get("/api/csrf-token");
    expect(res.status).toBe(200);
    expect(typeof res.body.csrfToken).toBe("string");
    expect(res.body.csrfToken.length).toBeGreaterThan(20);

    // Paired cookie must be set on the response (the lib uses this on
    // subsequent mutation requests to validate the token).
    const cookies = res.headers["set-cookie"]?.join(";") || "";
    expect(cookies).toMatch(/csrf-secret/);
  });
});

// ════════════════════════════════════════════════════════════
// Rejection path
// ════════════════════════════════════════════════════════════

describe("CSRF — mutating requests without a token", () => {
  it("POST without token → 403 + { code: 'CSRF_INVALID', requestId }", async () => {
    const res = await request(app).post("/api/probe").send({ x: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_INVALID");
    expect(res.body.error).toMatch(/CSRF/i);
    expect(typeof res.body.requestId).toBe("string");
  });

  it("PUT without token → 403", async () => {
    const res = await request(app).put("/api/probe").send({});
    expect(res.status).toBe(403);
  });

  it("DELETE without token → 403", async () => {
    const res = await request(app).delete("/api/probe");
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════
// Success path with valid token
// ════════════════════════════════════════════════════════════

describe("CSRF — mutating requests WITH a valid token", () => {
  it("POST after first fetching the token + carrying the cookie → 200", async () => {
    const agent = request.agent(app);  // persists cookies between calls

    // 1. mint a token (also sets the paired cookie on the agent)
    const tokenRes = await agent.get("/api/csrf-token");
    expect(tokenRes.status).toBe(200);
    const token = tokenRes.body.csrfToken;

    // 2. mutating request with the token in the header
    const res = await agent
      .post("/api/probe")
      .set("x-csrf-token", token)
      .send({ x: 1 });
    expect(res.status).toBe(200);
    expect(res.body.method).toBe("POST");
  });

  it("token-without-cookie is rejected (defends against header-only spoofing)", async () => {
    // Get the token but DROP the agent — send the token from a fresh
    // client that doesn't have the paired cookie.
    const tokenRes = await request(app).get("/api/csrf-token");
    const token = tokenRes.body.csrfToken;

    const res = await request(app)
      .post("/api/probe")
      .set("x-csrf-token", token)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════
// Skip list — these paths are public-or-otherwise-protected
// ════════════════════════════════════════════════════════════

describe("CSRF — skip list", () => {
  it("/api/payment/webhook bypasses CSRF (Razorpay validates via HMAC)", async () => {
    const res = await request(app)
      .post("/api/payment/webhook")
      .send({ event: "payment.captured" });
    expect(res.status).toBe(200);
    expect(res.body.route).toBe("webhook");
  });

  it("/api/csrf-token bypasses CSRF (it's the issuer)", async () => {
    // No token, no cookie — should still mint a fresh one.
    const res = await request(app).get("/api/csrf-token");
    expect(res.status).toBe(200);
  });

  it("/api/health bypasses CSRF (public probe)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// Read methods — never checked
// ════════════════════════════════════════════════════════════

describe("CSRF — GET/HEAD/OPTIONS are never checked", () => {
  it("GET without token works fine", async () => {
    const res = await request(app).get("/api/probe");
    expect(res.status).toBe(200);
    expect(res.body.method).toBe("GET");
  });
});
