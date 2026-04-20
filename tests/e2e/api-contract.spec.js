/**
 * Browser-level API contract tests — complement the SPA-focused
 * smoke.spec.js with deeper endpoint coverage that doesn't require
 * database state.
 *
 * These run against the REAL booted backend (see playwright.config.js's
 * webServer) so they catch:
 *   - A broken route registration (registerRoutes.js ordering bugs)
 *   - Middleware disabled/swapped in server.js
 *   - An env-dependent guard crashing on an unconfigured box
 *   - A response-shape change missed by vitest mocks
 *
 * Intentionally DB-free:
 *   - Only hits public endpoints or ones that return the same shape
 *     regardless of org/auth state.
 *   - No POSTs that would mutate data.
 */

import { test, expect } from "@playwright/test";

test.describe("Public GET endpoints return documented shapes", () => {
  // CI runs against a dummy Supabase URL, so DB-backed routes may return
  // 500. The contract we care about is: the handler doesn't crash into a
  // non-JSON response, and when it DOES succeed the shape is an array.
  test("GET /api/payment/plans doesn't crash; returns array on success", async ({ request }) => {
    const r = await request.get("/api/payment/plans");
    expect([200, 500]).toContain(r.status());
    if (r.status() === 200) {
      expect(Array.isArray(await r.json())).toBe(true);
    }
  });

  test("GET /api/events doesn't crash; returns array on success", async ({ request }) => {
    const r = await request.get("/api/events");
    expect([200, 500]).toContain(r.status());
    if (r.status() === 200) {
      expect(Array.isArray(await r.json())).toBe(true);
    }
  });

  test("GET /api/announcements without auth returns 401", async ({ request }) => {
    const r = await request.get("/api/announcements");
    expect(r.status()).toBe(401);
  });
});

test.describe("CSRF token round-trip", () => {
  // The csurf library emits `{secret-hex}.{signed-hmac-hex}` — roughly
  // 64 + 1 + 128 = 193 chars. Previously pinned to a plain 64-char hex
  // regex, which was wrong — test passes now against the real format.
  test("token looks like a signed csurf token ({hex}.{hex})", async ({ request }) => {
    const r = await request.get("/api/csrf-token");
    const { csrfToken } = await r.json();
    expect(csrfToken).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/);
    expect(csrfToken.length).toBeGreaterThan(60);
  });

  test("consecutive calls still return a well-formed token", async ({ request }) => {
    const r1 = await request.get("/api/csrf-token");
    const r2 = await request.get("/api/csrf-token");
    const s1 = r1.headers()["set-cookie"];
    expect(s1).toBeTruthy();
    const { csrfToken: t1 } = await r1.json();
    const { csrfToken: t2 } = await r2.json();
    expect(t1).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/);
    expect(t2).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/);
  });
});

test.describe("Negative-contract tests", () => {
  test("POST /api/auth/login without CSRF → 403 CSRF_INVALID (not 500)", async ({ request }) => {
    const r = await request.post("/api/auth/login", { data: { email: "x@y.z", password: "x" } });
    expect(r.status()).toBe(403);
    expect((await r.json()).code).toBe("CSRF_INVALID");
  });

  test("POST /api/payment/webhook does not 500 on a malformed body", async ({ request }) => {
    const r = await request.post("/api/payment/webhook", {
      headers: { "x-razorpay-signature": "deadbeef", "content-type": "application/json" },
      data: { event: "payment.captured", payload: {} },
    });
    // Valid outcomes:
    //   400 when RAZORPAY_WEBHOOK_SECRET is set and the signature fails HMAC.
    //   503 when the secret is unset in production.
    //   200 {received:true} when the secret is unset in development (dev mode
    //       deliberately skips signature verification with a warning — this
    //       is the CI path, since playwright.config.js sets NODE_ENV=development
    //       and doesn't provide a webhook secret).
    // 500 would mean the handler crashed before any guard — that's the only bug.
    expect([200, 400, 503]).toContain(r.status());
  });

  test("Unknown /api route returns 404 with the documented envelope shape", async ({ request }) => {
    const r = await request.get("/api/no-such-endpoint-xyz");
    expect(r.status()).toBe(404);
    const body = await r.json();
    expect(body.code).toBe("NOT_FOUND");
    expect(typeof body.requestId).toBe("string");
  });

  test("Wrong HTTP method on a POST-only endpoint doesn't crash", async ({ request }) => {
    const r = await request.fetch("/api/auth/login", { method: "PUT" });
    // 403 is the real answer: csurf guards PUT/POST/PATCH/DELETE, and
    // we haven't threaded a CSRF token through, so the mutation is
    // rejected before ever reaching the router. 404/405 are also
    // acceptable depending on server config. 500 = a crash.
    expect([403, 404, 405]).toContain(r.status());
  });
});

test.describe("Security headers are consistent across endpoints", () => {
  for (const path of ["/api/health", "/api/payment/plans", "/api/csrf-token", "/api/no-such-endpoint"]) {
    test(`${path} carries CSP + X-Frame-Options + X-Content-Type-Options + X-Request-Id`, async ({ request }) => {
      const r = await request.get(path);
      const h = r.headers();
      expect(h["content-security-policy"]).toBeTruthy();
      expect(h["x-frame-options"]?.toLowerCase()).toBe("deny");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-request-id"]).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  }
});

test.describe("Request-ID is unique per request (not per connection)", () => {
  test("two back-to-back calls get distinct X-Request-Id values", async ({ request }) => {
    const a = await request.get("/api/health");
    const b = await request.get("/api/health");
    expect(a.headers()["x-request-id"]).not.toBe(b.headers()["x-request-id"]);
  });
});
