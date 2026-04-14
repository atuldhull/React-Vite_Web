/**
 * Integration tests for the security middleware wired into app.js.
 *
 * These verify the contract from the OUTSIDE — what the client
 * actually sees in response headers and status codes. That's what
 * matters for security: a misconfigured CSP with the right import
 * statement is no better than no CSP at all, and the previous
 * grep-the-source tests would have happily passed it.
 *
 * We boot a minimal Express app that mounts the same hardening pieces
 * the real app.js uses, plus one trivial route to bounce a response
 * off. Mocking is kept thin — these are a contract against the live
 * middleware, not a unit test of the helmet library.
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import { requestIdMiddleware } from "../../backend/middleware/requestId.js";
import {
  applyHelmet,
  applyCors,
  applyHPP,
  applyRequestLogger,
} from "../../backend/middleware/security.js";

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  applyHelmet(app);
  applyCors(app);
  applyHPP(app);
  applyRequestLogger(app);

  app.get("/ping", (req, res) => {
    res.json({ ok: true, q: req.query });
  });
  return app;
}

// ════════════════════════════════════════════════════════════
// Helmet — CSP + frame deny + nosniff + referrer + powered-by
// ════════════════════════════════════════════════════════════

describe("applyHelmet — security headers", () => {
  it("sets a Content-Security-Policy header (CSP is no longer disabled)", async () => {
    const res = await request(buildApp()).get("/ping");
    expect(res.headers["content-security-policy"]).toBeDefined();
    // Sanity-check a few of the directives so a regression that
    // accidentally narrows the policy is caught — the SPA depends on
    // these origins (Supabase realtime, OpenRouter, dicebear avatars).
    const csp = res.headers["content-security-policy"];
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).toMatch(/connect-src[^;]*supabase\.co/);
    expect(csp).toMatch(/frame-src 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
  });

  it("denies framing (clickjacking defence)", async () => {
    const res = await request(buildApp()).get("/ping");
    expect(res.headers["x-frame-options"]?.toLowerCase()).toBe("deny");
  });

  it("disables MIME sniffing", async () => {
    const res = await request(buildApp()).get("/ping");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("hides x-powered-by (no Express fingerprinting)", async () => {
    const res = await request(buildApp()).get("/ping");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets a strict referrer policy", async () => {
    const res = await request(buildApp()).get("/ping");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});

// ════════════════════════════════════════════════════════════
// CORS — origin allowlist (localhost + FRONTEND_URL only)
// ════════════════════════════════════════════════════════════

describe("applyCors — origin allowlist", () => {
  it("echoes Access-Control-Allow-Origin for an allowed (localhost) origin", async () => {
    const res = await request(buildApp())
      .get("/ping")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("rejects a disallowed origin (no allow-origin header on the response)", async () => {
    const res = await request(buildApp())
      .get("/ping")
      .set("Origin", "http://evil.example.com");
    // CORS errors come back as 500 from the cors middleware's callback;
    // the important contract is that the browser would NOT see an
    // Access-Control-Allow-Origin header echoing the evil origin.
    expect(res.headers["access-control-allow-origin"]).not.toBe("http://evil.example.com");
  });

  it("allows a request with no Origin header (server-to-server / curl)", async () => {
    const res = await request(buildApp()).get("/ping");
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// HPP — HTTP Parameter Pollution
// ════════════════════════════════════════════════════════════

describe("applyHPP — duplicate query keys", () => {
  it("collapses ?role=student&role=admin to the LAST value (admin)", async () => {
    const res = await request(buildApp()).get("/ping?role=student&role=admin");
    expect(res.status).toBe(200);
    expect(res.body.q.role).toBe("admin");
  });

  it("leaves single-valued params untouched", async () => {
    const res = await request(buildApp()).get("/ping?page=3");
    expect(res.body.q.page).toBe("3");
  });
});

// ════════════════════════════════════════════════════════════
// Suspicious request logger — blocks scanner / injection patterns
// ════════════════════════════════════════════════════════════

describe("applyRequestLogger — suspicious URL blocker", () => {
  it("blocks path-traversal attempts with 400", async () => {
    const res = await request(buildApp()).get("/ping/../../etc/passwd");
    expect(res.status).toBe(400);
  });

  it("blocks <script> in URL with 400", async () => {
    const res = await request(buildApp()).get("/ping?q=%3Cscript%3Ealert(1)%3C/script%3E");
    expect(res.status).toBe(400);
  });

  it("blocks SQL-injection-style UNION SELECT with 400", async () => {
    const res = await request(buildApp()).get("/ping?q=1%20UNION%20SELECT%20*");
    expect(res.status).toBe(400);
  });

  it("blocks WordPress scanner probes (/wp-admin) with 400", async () => {
    const res = await request(buildApp()).get("/wp-admin");
    expect(res.status).toBe(400);
  });

  it("lets normal URLs through", async () => {
    const res = await request(buildApp()).get("/ping?q=hello");
    expect(res.status).toBe(200);
  });
});
